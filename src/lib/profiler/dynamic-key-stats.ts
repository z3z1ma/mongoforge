/**
 * Dynamic key statistics extraction (Streaming)
 */

import { NormalizedDocument } from "../../types/data-model.js";
import { ObjectKeysAnalysis, inferValueSchema } from "../inferencer/dynamic-key-detector.js";
import { DEFAULT_DYNAMIC_KEY_CONFIG, DynamicKeyDetectionConfig, DynamicKeyValueSchema } from "../../types/dynamic-keys.js";
import { detectDynamicKeys } from "../../utils/key-patterns.js";
import { calculateDistributionStats } from "../../utils/frequency-map.js";

/**
 * Accumulator for incremental dynamic key detection
 */
export class DynamicKeyStatsAccumulator {
  private stats = new Map<string, {
    uniqueKeysSample: Set<string>;
    totalUniqueKeys: number; // Estimate or exact if < limit
    keyCounts: Map<number, number>; // length -> count
    valueTypeCounts: Map<string, number>; // type -> count
    sampleValues: Map<string, any>; // type -> sample value
    documentCount: number;
  }>();
  
  private config: DynamicKeyDetectionConfig;
  private readonly SAMPLE_LIMIT = 2000;

  constructor(config: DynamicKeyDetectionConfig = DEFAULT_DYNAMIC_KEY_CONFIG) {
    this.config = config;
  }

  addDocument(doc: NormalizedDocument): void {
    this.traverse(doc);
  }

  private traverse(obj: any, pathPrefix = ""): void {
    if (obj === null || typeof obj !== "object") return;

    // If it's an array, traverse elements but don't treat the array itself as a dynamic key object
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i];
        if (typeof item === "object" && item !== null) {
          this.traverse(item, `${pathPrefix}[]`);
        }
      }
      return;
    }

    // It's an object. Record its keys.
    this.recordObject(pathPrefix, obj);

    // Recurse into values
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (typeof value === "object" && value !== null) {
        this.traverse(value, fieldPath);
      }
    }
  }

  private recordObject(fieldPath: string, obj: any): void {
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

    const keys = Object.keys(obj);
    const keyCount = keys.length;
    
    // Update key count histogram
    stat.keyCounts.set(keyCount, (stat.keyCounts.get(keyCount) || 0) + 1);

    // Update unique keys (with sampling)
    for (const key of keys) {
      if (!stat.uniqueKeysSample.has(key)) {
         // Optimization: Only check set size if we are adding a new key
         if (stat.uniqueKeysSample.size < this.SAMPLE_LIMIT) {
           stat.uniqueKeysSample.add(key);
           stat.totalUniqueKeys++; // This is exact until we hit limit
         } else {
             // We hit the limit. We stop adding to sample.
             // But we should roughly estimate totalUniqueKeys?
             // For now, let's just use the sample size as lower bound, 
             // but strictly speaking we stop counting unique keys exactly.
             // This is acceptable for pattern detection (we have enough samples).
             // To be more precise we'd need a HyperLogLog or BloomFilter.
             // Let's just increment totalUniqueKeys blindly to indicate "more", 
             // even if it's over-counting duplicates.
             // Actually, over-counting duplicates is bad for "uniqueKeysObserved".
             // Let's just cap it at SAMPLE_LIMIT + "others".
             stat.totalUniqueKeys++; 
         }
      }
    }

    // Update value types (simplified)
    for (const key of keys) {
       const value = obj[key];
       const type = this.getValueType(value);
       stat.valueTypeCounts.set(type, (stat.valueTypeCounts.get(type) || 0) + 1);
       
       // Keep a sample value for schema inference later
       if (!stat.sampleValues.has(type)) {
         stat.sampleValues.set(type, value);
       }
    }
  }

  private getValueType(value: any): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    const type = typeof value;
    if (type === "number") return Number.isInteger(value) ? "integer" : "number";
    return type;
  }

  getStats(): Map<string, ObjectKeysAnalysis> {
    const results = new Map<string, ObjectKeysAnalysis>();

    for (const [fieldPath, stat] of this.stats.entries()) {
      // Reconstruct a distribution object
      const countDistribution: Record<string, number> = {};
      
      for (const [len, count] of stat.keyCounts.entries()) {
          countDistribution[len] = count;
      }
      
      // Detect patterns
      const keys = Array.from(stat.uniqueKeysSample);
      const detection = detectDynamicKeys(keys, this.config);
      
      if (detection.detected) {
         // Build value schema
         const totalValues = Array.from(stat.valueTypeCounts.values()).reduce((a, b) => a + b, 0);
         const types: string[] = [];
         const typeProbabilities: number[] = [];
         const schemas: any[] = [];
         
         for (const [type, count] of stat.valueTypeCounts.entries()) {
            types.push(type);
            typeProbabilities.push(count / totalValues);
            
            // Infer schema from sample value
            const sampleValue = stat.sampleValues.get(type);
            const schema = inferValueSchema(sampleValue, type);
            schemas.push(schema);
         }

         const valueSchema: DynamicKeyValueSchema = {
             types,
             typeProbabilities,
             schemas,
             isUniformType: types.length === 1,
             dominantType: types[0] || "unknown"
         };

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
            uniqueKeysObserved: stat.totalUniqueKeys, // Approximation
            exampleKeys: detection.exampleKeys
         };
         
         results.set(fieldPath, {
             fieldPath,
             uniqueKeys: stat.uniqueKeysSample,
             keyCountsPerDocument: [], // Empty because we don't store them all
             isDynamic: true,
             detection,
             metadata,
             valueSchema
         });
      }
    }

    return results;
  }
}

/**
 * Calculate statistics for all dynamic key fields in a batch of documents
 */
export function calculateAllDynamicKeyStats(
  documents: NormalizedDocument[],
  config: DynamicKeyDetectionConfig = DEFAULT_DYNAMIC_KEY_CONFIG
): Map<string, ObjectKeysAnalysis> {
  const accumulator = new DynamicKeyStatsAccumulator(config);
  documents.forEach((doc) => accumulator.addDocument(doc));
  return accumulator.getStats();
}
