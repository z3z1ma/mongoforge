/**
 * Dynamic key detection for schema inference
 * Feature: 002-dynamic-key-inference
 *
 * Detects objects with highly variable string keys and represents them
 * as dynamic key patterns instead of exhaustive key enumerations.
 *
 * @module lib/inferencer/dynamic-key-detector
 */

import type {
  DynamicKeyDetectionConfig,
  DynamicKeyMetadata,
  DynamicKeyValueSchema,
} from "../../types/dynamic-keys.js";
import {
  detectDynamicKeys,
  type DetectionResult,
} from "../../utils/key-patterns.js";
import {
  calculateFrequencies,
  calculateDistributionStats,
} from "../../utils/frequency-map.js";
import { logger } from "../../utils/logger.js";

/**
 * Result of analyzing object keys for dynamic key patterns
 */
export interface ObjectKeysAnalysis {
  /** Field path being analyzed */
  fieldPath: string;

  /** All unique keys observed across documents */
  uniqueKeys: Set<string>;

  /** Key count per document */
  keyCountsPerDocument: number[];

  /** Whether dynamic keys were detected */
  isDynamic: boolean;

  /** Detection result if dynamic */
  detection?: DetectionResult;

  /** Metadata if dynamic */
  metadata?: DynamicKeyMetadata;

  /** Value schema if dynamic */
  valueSchema?: DynamicKeyValueSchema;
}

/**
 * Value type observation for a dynamic key
 */
interface ValueTypeObservation {
  type: string;
  count: number;
  sampleSchemas: any[];
}

/**
 * Count unique keys in an object field across documents
 *
 * Traverses documents using dot-notation field paths and collects all unique
 * string keys from object values. Ignores non-object values (arrays, primitives, null).
 *
 * @param documents - Array of documents to analyze
 * @param fieldPath - Dot-notation path to the object field (e.g., "user.preferences")
 * @returns Set of unique keys observed across all documents
 *
 * @example
 * ```typescript
 * const docs = [
 *   { data: { key1: 1, key2: 2 } },
 *   { data: { key2: 2, key3: 3 } }
 * ];
 * const keys = countUniqueKeys(docs, 'data');
 * // Returns Set { 'key1', 'key2', 'key3' }
 * ```
 */
export function countUniqueKeys(
  documents: any[],
  fieldPath: string,
): Set<string> {
  const objects: any[] = [];

  for (const doc of documents) {
    const value = getValueAtPath(doc, fieldPath);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      objects.push(value);
    }
  }

  return countUniqueKeysFromObjects(objects, fieldPath);
}

/**
 * Count unique keys from a list of objects
 *
 * @param objects - Array of objects to analyze
 * @param fieldPath - Optional path for logging
 * @returns Set of unique keys observed
 */
export function countUniqueKeysFromObjects(
  objects: any[],
  fieldPath?: string,
): Set<string> {
  const uniqueKeys = new Set<string>();

  for (const obj of objects) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const key of Object.keys(obj)) {
        uniqueKeys.add(key);
      }
    }
  }

  // Debug logging for fields with many keys
  if (uniqueKeys.size > 50) {
    logger.debug("Found high key count in objects", {
      fieldPath,
      uniqueKeyCount: uniqueKeys.size,
      exampleKeys: Array.from(uniqueKeys).slice(0, 5),
    });
  }

  return uniqueKeys;
}

/**
 * Get value at a dot-notation path in an object
 */
function getValueAtPath(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Collect key counts from a list of objects
 *
 * @param objects - Array of objects to analyze
 * @returns Array of key counts
 */
function collectKeyCountsFromObjects(objects: any[]): number[] {
  const counts: number[] = [];

  for (const obj of objects) {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      counts.push(Object.keys(obj).length);
    }
  }

  return counts;
}

/**
 * Analyze a collection of objects for dynamic key patterns
 *
 * @param objects - Array of objects to analyze
 * @param fieldPath - Dot-notation path for identification and logging
 * @param config - Detection configuration
 * @param depth - Current recursion depth
 * @returns Analysis result
 */
export function analyzeObjectsDirectly(
  objects: any[],
  fieldPath: string,
  config: DynamicKeyDetectionConfig,
  depth: number = 0,
): ObjectKeysAnalysis {
  // Count unique keys
  const uniqueKeys = countUniqueKeysFromObjects(objects, fieldPath);

  // Collect key counts per object
  const keyCounts = collectKeyCountsFromObjects(objects);

  // Run pattern detection
  const keys = Array.from(uniqueKeys);
  const detection = detectDynamicKeys(keys, config);

  if (!detection.detected) {
    return {
      fieldPath,
      uniqueKeys,
      keyCountsPerDocument: keyCounts,
      isDynamic: false,
      detection,
    };
  }

  // Analyze value types for detected dynamic keys
  const valueSchema = analyzeValueTypes(
    objects,
    "", // No path needed as we pass objects directly
    uniqueKeys,
    config,
    depth,
  );

  // Build complete metadata
  const metadata = buildDynamicKeyMetadata(
    detection,
    keyCounts,
    objects.length,
    valueSchema,
  );

  return {
    fieldPath,
    uniqueKeys,
    keyCountsPerDocument: keyCounts,
    isDynamic: true,
    detection,
    metadata,
    valueSchema,
  };
}

/**
 * Analyze value types for dynamic keys
 *
 * Examines the values associated with dynamic keys across all documents to determine
 * type distribution and generate a schema. Calculates type probabilities based on
 * observation frequency and creates sample schemas for each type.
 *
 * @param documents - Array of documents to analyze (or objects if fieldPath is "")
 * @param fieldPath - Dot-notation path to the object field
 * @param keys - Set of dynamic keys to analyze
 * @param config - Optional configuration for recursive detection
 * @param depth - Current recursion depth
 * @returns Value schema describing types, probabilities, and sample schemas
 */
export function analyzeValueTypes(
  documents: any[],
  fieldPath: string,
  keys: Set<string>,
  config?: DynamicKeyDetectionConfig,
  depth: number = 0,
): DynamicKeyValueSchema {
  const typeObservations = new Map<string, ValueTypeObservation>();
  const allValuesPerType = new Map<string, any[]>();

  // Collect all value types across all keys and documents
  for (const doc of documents) {
    const obj = fieldPath === "" ? doc : getValueAtPath(doc, fieldPath);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      continue;
    }

    // Optimization: if obj has fewer keys than 'keys' set, iterate over obj
    const objKeys = Object.keys(obj);
    if (objKeys.length < keys.size) {
      for (const key of objKeys) {
        if (keys.has(key)) {
          const value = obj[key];
          processValue(value, typeObservations, allValuesPerType);
        }
      }
    } else {
      for (const key of keys) {
        if (key in obj) {
          const value = obj[key];
          processValue(value, typeObservations, allValuesPerType);
        }
      }
    }
  }

  // Helper to process a single value
  function processValue(
    value: any,
    observations: Map<string, ValueTypeObservation>,
    valuesMap: Map<string, any[]>,
  ) {
    const type = getValueType(value);
    const observation = observations.get(type) || {
      type,
      count: 0,
      sampleSchemas: [],
    };

    observation.count++;
    observations.set(type, observation);

    // Collect values for recursive analysis if it's an object
    if (type === "object") {
      const values = valuesMap.get(type) || [];
      values.push(value);
      valuesMap.set(type, values);
    }
  }

  // Convert observations to schema format
  const types: string[] = [];
  const typeProbabilities: number[] = [];
  const schemas: any[] = [];

  const totalObservations = Array.from(typeObservations.values()).reduce(
    (sum, obs) => sum + obs.count,
    0,
  );

  // Sort by count (descending) for consistent ordering
  const sortedObservations = Array.from(typeObservations.values()).sort(
    (a, b) => b.count - a.count,
  );

  for (const obs of sortedObservations) {
    types.push(obs.type);
    typeProbabilities.push(obs.count / totalObservations);

    let schema: any;

    // Recursive detection for nested objects
    if (obs.type === "object" && config && depth < 5) {
      const objects = allValuesPerType.get("object") || [];
      const nestedAnalysis = analyzeObjectsDirectly(
        objects,
        `${fieldPath ? fieldPath + "." : ""}*`,
        config,
        depth + 1,
      );

      if (nestedAnalysis.isDynamic && nestedAnalysis.metadata) {
        schema = {
          type: "object",
          "x-dynamic-keys": {
            enabled: true,
            metadata: nestedAnalysis.metadata,
            valueSchema: nestedAnalysis.valueSchema,
          },
        };
      }
    }

    // Fallback to standard inference if not dynamic or not an object
    if (!schema) {
      // Collect some samples for standard inference
      const samples = allValuesPerType.get(obs.type) || [];
      const representativeValue = samples[0];
      schema = inferValueSchema(representativeValue, obs.type);
    }

    schemas.push(schema);
  }

  const isUniformType = types.length === 1;
  const dominantType = types[0] || "unknown";

  return {
    types,
    typeProbabilities,
    schemas,
    isUniformType,
    dominantType,
  };
}

/**
 * Get the JSON Schema type of a value
 */
function getValueType(value: any): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";

  const type = typeof value;
  if (type === "object") return "object";
  if (type === "boolean") return "boolean";
  if (type === "number") return Number.isInteger(value) ? "integer" : "number";
  if (type === "string") return "string";

  return "unknown";
}

/**
 * Infer a simple JSON Schema for a value (recursive)
 */
function inferValueSchema(value: any, type: string, depth: number = 0): any {
  // Prevent infinite recursion
  if (depth > 10) {
    return { type };
  }

  const schema: any = { type };

  if (type === "string" && typeof value === "string") {
    // Add enum for small strings to preserve fidelity
    if (value.length < 100) {
      schema.enum = [value];
    }
    schema.minLength = value.length;
    schema.maxLength = value.length;
  } else if (type === "number" || type === "integer") {
    schema.minimum = value;
    schema.maximum = value;
  } else if (type === "array" && Array.isArray(value)) {
    schema.minItems = value.length;
    schema.maxItems = value.length;

    // Infer item type from first element
    if (value.length > 0) {
      const itemType = getValueType(value[0]);
      schema.items = inferValueSchema(value[0], itemType, depth + 1);
    }
  } else if (type === "object" && value && typeof value === "object") {
    // Recursive object schema
    const properties: any = {};
    for (const key of Object.keys(value)) {
      const propType = getValueType(value[key]);
      properties[key] = inferValueSchema(value[key], propType, depth + 1);
    }
    schema.properties = properties;
  }

  return schema;
}

/**
 * Build DynamicKeyMetadata from detection results
 *
 * Constructs complete metadata including pattern information, confidence scores,
 * key count distributions, and statistical summaries. Calculates frequency distribution
 * from per-document key counts and computes statistical percentiles.
 *
 * @param detection - Detection result from pattern matching
 * @param keyCounts - Array of key counts per document (one count per document)
 * @param documentsAnalyzed - Total number of documents analyzed
 * @param valueSchema - Value type schema for dynamic key values
 * @returns Complete dynamic key metadata with all fields populated
 *
 * @example
 * ```typescript
 * const metadata = buildDynamicKeyMetadata(
 *   { detected: true, pattern: 'UUID', confidence: 0.95, ... },
 *   [10, 12, 11, 10], // 4 documents with varying key counts
 *   4,
 *   { types: ['string'], ... }
 * );
 * // Returns complete DynamicKeyMetadata object
 * ```
 */
export function buildDynamicKeyMetadata(
  detection: DetectionResult,
  keyCounts: number[],
  documentsAnalyzed: number,
  _valueSchema: DynamicKeyValueSchema,
): DynamicKeyMetadata {
  // Calculate frequency distribution of key counts
  const countDistribution = calculateFrequencies(keyCounts);
  const countStats = calculateDistributionStats(countDistribution);

  return {
    enabled: detection.detected,
    pattern: detection.pattern || "CUSTOM",
    customPattern: detection.customPattern,
    confidence: detection.confidence,
    confidenceLevel: detection.confidenceLevel,
    countDistribution,
    countStats,
    documentsAnalyzed,
    uniqueKeysObserved: detection.totalKeys,
    exampleKeys: detection.exampleKeys,
  };
}

/**
 * Check if a field path should be forced as static or dynamic
 *
 * @param fieldPath - Dot-notation field path
 * @param config - Dynamic key detection configuration
 * @returns 'static' | 'dynamic' | null (null means no override)
 */
function checkPathOverride(
  fieldPath: string,
  config: DynamicKeyDetectionConfig,
): "static" | "dynamic" | null {
  // Check force static paths
  for (const pattern of config.forceStaticPaths) {
    if (matchesPathPattern(fieldPath, pattern)) {
      return "static";
    }
  }

  // Check force dynamic paths
  for (const pattern of config.forceDynamicPaths) {
    if (matchesPathPattern(fieldPath, pattern)) {
      return "dynamic";
    }
  }

  return null;
}

/**
 * Match a field path against a pattern (supports wildcards)
 */
function matchesPathPattern(fieldPath: string, pattern: string): boolean {
  // Convert glob-style pattern to regex
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(fieldPath);
}

/**
 * Analyze object keys for dynamic key patterns
 *
 * Main entry point for dynamic key detection at a specific field path. Performs:
 * 1. Path override checking (forceStaticPaths/forceDynamicPaths)
 * 2. Unique key counting across documents
 * 3. Threshold validation
 * 4. Pattern matching against built-in patterns
 * 5. Value type analysis
 * 6. Metadata construction
 *
 * @param documents - Array of documents to analyze
 * @param fieldPath - Dot-notation path to the object field (e.g., "user.sessions")
 * @param config - Dynamic key detection configuration (threshold, patterns, overrides)
 * @returns Analysis result with detection status, metadata, and value schema
 *
 * @example
 * ```typescript
 * const analysis = analyzeObjectKeys(
 *   documents,
 *   'user.preferences',
 *   {
 *     threshold: 50,
 *     patterns: [...],
 *     minPatternMatch: 0.8,
 *     confidenceThreshold: 0.7,
 *     forceStaticPaths: [],
 *     forceDynamicPaths: []
 *   }
 * );
 *
 * if (analysis.isDynamic) {
 *   console.log(`Detected ${analysis.metadata.pattern} pattern`);
 *   console.log(`Confidence: ${analysis.metadata.confidence}`);
 * }
 * ```
 */
export function analyzeObjectKeys(
  documents: any[],
  fieldPath: string,
  config: DynamicKeyDetectionConfig,
): ObjectKeysAnalysis {
  logger.debug("Analyzing object keys for dynamic patterns", { fieldPath });

  // Check for path overrides
  const override = checkPathOverride(fieldPath, config);

  if (override === "static") {
    logger.debug("Field path forced as static keys", { fieldPath });
    return {
      fieldPath,
      uniqueKeys: new Set(),
      keyCountsPerDocument: [],
      isDynamic: false,
    };
  }

  // Collect objects for analysis
  const objects: any[] = [];
  for (const doc of documents) {
    const value = getValueAtPath(doc, fieldPath);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      objects.push(value);
    }
  }

  // If forced dynamic, skip pattern detection
  if (override === "dynamic") {
    logger.debug("Field path forced as dynamic keys", { fieldPath });

    const uniqueKeys = countUniqueKeysFromObjects(objects, fieldPath);
    const keyCounts = collectKeyCountsFromObjects(objects);
    const valueSchema = analyzeValueTypes(objects, "", uniqueKeys, config, 0);

    // Create a synthetic detection result
    const detection: DetectionResult = {
      detected: true,
      pattern: "CUSTOM",
      confidence: 1.0,
      confidenceLevel: "high",
      totalKeys: uniqueKeys.size,
      matchCount: uniqueKeys.size,
      matchRatio: 1.0,
      exampleKeys: Array.from(uniqueKeys).slice(0, 10),
    };

    const metadata = buildDynamicKeyMetadata(
      detection,
      keyCounts,
      documents.length,
      valueSchema,
    );

    return {
      fieldPath,
      uniqueKeys,
      keyCountsPerDocument: keyCounts,
      isDynamic: true,
      detection,
      metadata,
      valueSchema,
    };
  }

  // Delegate to core analysis logic
  const analysis = analyzeObjectsDirectly(objects, fieldPath, config, 0);

  if (analysis.isDynamic) {
    logger.info("Dynamic keys detected", {
      fieldPath,
      pattern: analysis.metadata?.pattern,
      confidence: analysis.metadata?.confidence,
      uniqueKeys: analysis.metadata?.uniqueKeysObserved,
    });
  }

  return analysis;
}
