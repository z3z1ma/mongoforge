/**
 * Dynamic key statistics extraction (Streaming)
 */

import { NormalizedDocument } from "../../types/data-model.js";
import {
  ObjectKeysAnalysis,
  inferValueSchema,
} from "../inferencer/dynamic-key-detector.js";
import {
  DEFAULT_DYNAMIC_KEY_CONFIG,
  DynamicKeyDetectionConfig,
  DynamicKeyValueSchema,
} from "../../types/dynamic-keys.js";
import { detectDynamicKeys } from "../../utils/key-patterns.js";
import { calculateDistributionStats } from "../../utils/frequency-map.js";

/**
 * Accumulator for incremental dynamic key detection
 */
interface PathStat {
  uniqueKeysSample: Set<string>;
  totalUniqueKeys: number; // Estimate or exact if < limit
  keyCounts: Map<number, number>; // length -> count
  valueTypeCounts: Map<string, number>; // type -> count
  sampleValues: Map<string, any>; // type -> sample value
  documentCount: number;
}

export class DynamicKeyStatsAccumulator {
  private stats = new Map<string, PathStat>();

  private config: DynamicKeyDetectionConfig;
  private readonly SAMPLE_LIMIT = 2000;
  private collapsedPaths = new Set<string>();

  constructor(config: DynamicKeyDetectionConfig = DEFAULT_DYNAMIC_KEY_CONFIG) {
    this.config = config;

    // Seed collapsed paths from forced dynamic paths
    if (this.config.forceDynamicPaths) {
      for (const path of this.config.forceDynamicPaths) {
        this.collapsedPaths.add(path);
      }
    }
  }

  addDocument(doc: NormalizedDocument): void {
    this.traverse(doc);
  }

  private traverse(obj: any, pathPrefix = "", normalizedPath = ""): void {
    // 1. Record the value at this path
    this.recordValue(normalizedPath, obj);

    if (obj === null || typeof obj !== "object") return;

    // 2. Recurse into children
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i];
        const nextNormalizedPath = normalizedPath
          ? `${normalizedPath}[]`
          : "[]";
        this.traverse(item, `${pathPrefix}[]`, nextNormalizedPath);
      }
      return;
    }

    // It's an object. Recurse into properties.
    for (const key of Object.keys(obj)) {
      if (key === "__typeHints" || key === "__metadata") continue;

      const value = obj[key];
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Determine if we should collapse this child path
      let nextNormalizedPath: string;
      if (this.isPathDynamic(normalizedPath)) {
        nextNormalizedPath = normalizedPath ? `${normalizedPath}.*` : "*";
      } else {
        nextNormalizedPath = normalizedPath ? `${normalizedPath}.${key}` : key;
      }

      this.traverse(value, fieldPath, nextNormalizedPath);
    }
  }

  private isPathDynamic(path: string): boolean {
    if (this.collapsedPaths.has(path)) return true;

    // NEVER collapse the root document - it should always have a static schema
    if (path === "") return false;

    const stat = this.stats.get(path);
    if (stat) {
      // Check if we should promote based on current keys
      if (this.shouldPromoteToDynamic(path, stat)) {
        this.promoteToDynamic(path);
        return true;
      }
    }

    return false;
  }

  private shouldPromoteToDynamic(path: string, stat: PathStat): boolean {
    // 1. Forced dynamic
    if (this.config.forceDynamicPaths?.includes(path)) return true;

    // 2. Threshold met
    if (stat.totalUniqueKeys >= this.config.threshold) return true;

    // 3. Early pattern match (optional optimization)
    // If it matches a known ID pattern, we can be more aggressive
    const patternSampleThreshold = Math.min(this.config.threshold, 10);
    if (stat.uniqueKeysSample.size >= patternSampleThreshold) {
      const keys = Array.from(stat.uniqueKeysSample);
      const detection = detectDynamicKeys(
        keys,
        this.config,
        stat.documentCount,
      );
      // Only promote if it matches a known pattern OR extremely high confidence
      if (
        detection.detected &&
        (detection.pattern !== null || detection.confidence > 0.8)
      ) {
        return true;
      }
    }

    return false;
  }

  private promoteToDynamic(path: string): void {
    if (this.collapsedPaths.has(path)) return;
    this.collapsedPaths.add(path);

    // Migrate existing specific child paths to wildcard versions
    const pathsToMigrate = Array.from(this.stats.keys()).filter(
      (p) => p.startsWith(path + ".") && !p.startsWith(path + ".*"),
    );

    for (const existingPath of pathsToMigrate) {
      const suffix = existingPath.substring(path.length + 1);
      const firstDot = suffix.indexOf(".");
      const remainingSuffix = firstDot === -1 ? "" : suffix.substring(firstDot);
      const newPath = `${path}.*${remainingSuffix}`;

      this.mergeStats(existingPath, newPath);
    }
  }

  private mergeStats(fromPath: string, toPath: string): void {
    const fromStat = this.stats.get(fromPath);
    if (!fromStat) return;

    let toStat = this.stats.get(toPath);
    if (!toStat) {
      this.stats.set(toPath, fromStat);
      this.stats.delete(fromPath);
      return;
    }

    // Merge counts
    toStat.documentCount += fromStat.documentCount;
    for (const [len, count] of fromStat.keyCounts.entries()) {
      toStat.keyCounts.set(len, (toStat.keyCounts.get(len) || 0) + count);
    }

    // Merge unique keys
    for (const key of fromStat.uniqueKeysSample) {
      if (
        !toStat.uniqueKeysSample.has(key) &&
        toStat.uniqueKeysSample.size < this.SAMPLE_LIMIT
      ) {
        toStat.uniqueKeysSample.add(key);
      }
    }
    toStat.totalUniqueKeys = Math.max(
      toStat.totalUniqueKeys,
      fromStat.totalUniqueKeys,
    );

    // Merge value types
    for (const [type, count] of fromStat.valueTypeCounts.entries()) {
      toStat.valueTypeCounts.set(
        type,
        (toStat.valueTypeCounts.get(type) || 0) + count,
      );
      if (!toStat.sampleValues.has(type)) {
        toStat.sampleValues.set(type, fromStat.sampleValues.get(type));
      }
    }

    this.stats.delete(fromPath);
  }

  private recordValue(fieldPath: string, value: any): void {
    let stat = this.stats.get(fieldPath);
    if (!stat) {
      stat = {
        uniqueKeysSample: new Set(),
        totalUniqueKeys: 0,
        keyCounts: new Map(),
        valueTypeCounts: new Map(),
        sampleValues: new Map(),
        documentCount: 0,
      };
      this.stats.set(fieldPath, stat);
    }

    stat.documentCount++;

    // 1. Record the type of this value
    const thisType = this.getValueType(value);
    stat.valueTypeCounts.set(
      thisType,
      (stat.valueTypeCounts.get(thisType) || 0) + 1,
    );
    if (!stat.sampleValues.has(thisType)) {
      stat.sampleValues.set(thisType, value);
    }

    // 2. If it's an object, record its keys
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      const keyCount = keys.length;

      // Update key count histogram
      stat.keyCounts.set(keyCount, (stat.keyCounts.get(keyCount) || 0) + 1);

      // Update unique keys (with sampling)
      for (const key of keys) {
        if (key === "__typeHints" || key === "__metadata") continue;
        if (!stat.uniqueKeysSample.has(key)) {
          // Optimization: Only check set size if we are adding a new key
          if (stat.uniqueKeysSample.size < this.SAMPLE_LIMIT) {
            stat.uniqueKeysSample.add(key);
            stat.totalUniqueKeys++; // This is exact until we hit limit
          } else {
            stat.totalUniqueKeys++;
          }
        }
      }
    }
  }

  private getValueType(value: any): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    const type = typeof value;
    if (type === "number")
      return Number.isInteger(value) ? "integer" : "number";
    return type;
  }

  getStats(): Map<string, ObjectKeysAnalysis> {
    const results = new Map<string, ObjectKeysAnalysis>();

    // Sort paths shallowest first to process parents before nested children
    const sortedPaths = Array.from(this.stats.keys()).sort(
      (a, b) => a.length - b.length,
    );

    for (const fieldPath of sortedPaths) {
      // Root is NEVER dynamic
      if (fieldPath === "") continue;

      const stat = this.stats.get(fieldPath)!;

      // Only include results for paths that were actually promoted to dynamic
      // or meet the promotion criteria at the end of analysis.
      if (
        !this.collapsedPaths.has(fieldPath) &&
        !this.shouldPromoteToDynamic(fieldPath, stat)
      ) {
        continue;
      }

      // Detect patterns with full context
      const keys = Array.from(stat.uniqueKeysSample);
      const detection = detectDynamicKeys(
        keys,
        this.config,
        stat.documentCount,
      );

      if (detection.detected) {
        // Build value schema from the aggregated values (wildcard path)
        const wildcardPath = `${fieldPath}.*`;
        const childStat = this.stats.get(wildcardPath);

        const valueSchema = childStat
          ? this.buildValueSchema(wildcardPath, childStat)
          : this.buildValueSchema(fieldPath, stat);

        const countDistribution = this.getDistribution(stat);
        const countStats = calculateDistributionStats(countDistribution);

        const metadata = {
          enabled: true,
          pattern: detection.pattern || "CUSTOM",
          customPattern: detection.customPattern,
          confidence: detection.confidence,
          confidenceLevel: detection.confidenceLevel,
          countDistribution,
          countStats,
          documentsAnalyzed: stat.documentCount,
          uniqueKeysObserved: stat.totalUniqueKeys,
          exampleKeys: detection.exampleKeys,
        };

        results.set(fieldPath, {
          fieldPath,
          uniqueKeys: stat.uniqueKeysSample,
          keyCountsPerDocument: [], // Empty because we don't store them all
          isDynamic: true,
          detection,
          metadata,
          valueSchema,
        });
      }
    }

    return results;
  }

  private getDistribution(stat: PathStat): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const [len, count] of stat.keyCounts.entries()) {
      dist[len] = count;
    }
    return dist;
  }

  /**
   * Build high-fidelity value schema for values at a specific path
   */
  private buildValueSchema(
    path: string,
    stat: PathStat | undefined,
  ): DynamicKeyValueSchema {
    if (!stat) {
      return {
        types: ["string"],
        typeProbabilities: [1],
        schemas: [{ type: "string" }],
        isUniformType: true,
        dominantType: "string",
      };
    }

    const totalValues = Array.from(stat.valueTypeCounts.values()).reduce(
      (a, b) => (a as number) + (b as number),
      0,
    ) as number;

    const types: string[] = [];
    const typeProbabilities: number[] = [];
    const schemas: any[] = [];

    // Sort types by frequency
    const sortedTypes = Array.from(stat.valueTypeCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );

    for (const [type, count] of sortedTypes) {
      types.push(type);
      typeProbabilities.push(count / totalValues);

      let schema: any;

      if (type === "object") {
        // 1. Check if the object at THIS path has dynamic keys
        const keys = Array.from(stat.uniqueKeysSample);
        const detection = detectDynamicKeys(
          keys,
          this.config,
          stat.documentCount,
        );

        if (detection.detected) {
          // Nested object is dynamic
          const wildcardPath = `${path}.*`;
          schema = {
            type: "object",
            "x-dynamic-keys": {
              enabled: true,
              metadata: {
                enabled: true,
                pattern: detection.pattern || "CUSTOM",
                customPattern: detection.customPattern,
                confidence: detection.confidence,
                confidenceLevel: detection.confidenceLevel,
                countDistribution: this.getDistribution(stat),
                countStats: calculateDistributionStats(
                  this.getDistribution(stat),
                ),
                documentsAnalyzed: stat.documentCount,
                uniqueKeysObserved: stat.totalUniqueKeys,
                exampleKeys: detection.exampleKeys,
              },
              valueSchema: this.buildValueSchema(
                wildcardPath,
                this.stats.get(wildcardPath),
              ),
            },
          };
        } else {
          // Nested object is STATIC - discover its properties from aggregated stats
          const properties: Record<string, any> = {};
          const prefix = path + ".";

          for (const [sap, sstat] of this.stats.entries()) {
            if (sap.startsWith(prefix)) {
              const propName = sap.substring(prefix.length);
              // Skip wildcard marker and deep children
              if (
                propName === "*" ||
                propName.includes(".") ||
                propName.includes("[]")
              ) {
                continue;
              }

              const propDvks = this.buildValueSchema(sap, sstat);
              properties[propName] = this.dvksToSchema(propDvks);
            }
          }

          if (Object.keys(properties).length > 0) {
            schema = {
              type: "object",
              properties,
              additionalProperties: false,
            };
          }
        }
      }

      if (!schema) {
        // Fallback to basic inference from sample value if no aggregated stats
        const sampleValue = stat.sampleValues.get(type);
        schema = inferValueSchema(sampleValue, type);
      }
      schemas.push(schema);
    }

    return {
      types,
      typeProbabilities,
      schemas,
      isUniformType: types.length === 1,
      dominantType: types[0] || "unknown",
    };
  }

  /**
   * Helper to convert DynamicKeyValueSchema to a standard JSON Schema
   */
  private dvksToSchema(dvks: DynamicKeyValueSchema): any {
    if (dvks.isUniformType && dvks.schemas.length > 0) {
      return dvks.schemas[0];
    }

    if (dvks.schemas.length === 0) {
      return { type: "string" };
    }

    return {
      anyOf: dvks.schemas,
      "x-type-probabilities": dvks.typeProbabilities,
    };
  }
}

/**
 * Calculate statistics for all dynamic key fields in a batch of documents
 */
export function calculateAllDynamicKeyStats(
  documents: NormalizedDocument[],
  config: DynamicKeyDetectionConfig = DEFAULT_DYNAMIC_KEY_CONFIG,
): Map<string, ObjectKeysAnalysis> {
  const accumulator = new DynamicKeyStatsAccumulator(config);
  documents.forEach((doc) => accumulator.addDocument(doc));
  return accumulator.getStats();
}
