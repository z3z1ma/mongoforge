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
  FrequencyDistribution,
} from "../../types/dynamic-keys.js";
import type { InferredSchema } from "../../types/data-model.js";
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
  const uniqueKeys = new Set<string>();

  for (const doc of documents) {
    const value = getValueAtPath(doc, fieldPath);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        uniqueKeys.add(key);
      }
    }
  }

  // Debug logging for fields with many keys
  if (uniqueKeys.size > 50) {
    logger.debug("Found field with high key count", {
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
 * Collect key counts per document for frequency distribution
 *
 * @param documents - Array of documents to analyze
 * @param fieldPath - Dot-notation path to the object field
 * @returns Array of key counts (one per document)
 */
function collectKeyCountsPerDocument(
  documents: any[],
  fieldPath: string,
): number[] {
  const counts: number[] = [];

  for (const doc of documents) {
    const value = getValueAtPath(doc, fieldPath);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      counts.push(Object.keys(value).length);
    }
  }

  return counts;
}

/**
 * Analyze value types for dynamic keys
 *
 * Examines the values associated with dynamic keys across all documents to determine
 * type distribution and generate a schema. Calculates type probabilities based on
 * observation frequency and creates sample schemas for each type.
 *
 * @param documents - Array of documents to analyze
 * @param fieldPath - Dot-notation path to the object field
 * @param keys - Set of dynamic keys to analyze
 * @returns Value schema describing types, probabilities, and sample schemas
 *
 * @example
 * ```typescript
 * const docs = [
 *   { data: { uuid1: 'value', uuid2: 123 } },
 *   { data: { uuid3: 'another', uuid4: 456 } }
 * ];
 * const keys = new Set(['uuid1', 'uuid2', 'uuid3', 'uuid4']);
 * const schema = analyzeValueTypes(docs, 'data', keys);
 * // Returns: { types: ['string', 'integer'], typeProbabilities: [0.5, 0.5], ... }
 * ```
 */
export function analyzeValueTypes(
  documents: any[],
  fieldPath: string,
  keys: Set<string>,
): DynamicKeyValueSchema {
  const typeObservations = new Map<string, ValueTypeObservation>();

  // Collect all value types across all keys and documents
  for (const doc of documents) {
    const obj = getValueAtPath(doc, fieldPath);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      continue;
    }

    for (const key of keys) {
      if (key in obj) {
        const value = obj[key];
        const type = getValueType(value);

        const observation = typeObservations.get(type) || {
          type,
          count: 0,
          sampleSchemas: [],
        };

        observation.count++;

        // Store sample schemas (max 3 per type)
        if (observation.sampleSchemas.length < 3) {
          observation.sampleSchemas.push(inferValueSchema(value, type));
        }

        typeObservations.set(type, observation);
      }
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

    // Use the first sample schema as representative
    schemas.push(obs.sampleSchemas[0] || { type: obs.type });
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
 * Infer a simple JSON Schema for a value
 */
function inferValueSchema(value: any, type: string): any {
  const schema: any = { type };

  if (type === "string" && typeof value === "string") {
    // Add basic string constraints
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
      schema.items = { type: itemType };
    }
  } else if (type === "object" && value && typeof value === "object") {
    // Simple object schema
    const properties: any = {};
    for (const key of Object.keys(value)) {
      const propType = getValueType(value[key]);
      properties[key] = { type: propType };
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
  valueSchema: DynamicKeyValueSchema,
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

  // Count unique keys across all documents
  const uniqueKeys = countUniqueKeys(documents, fieldPath);

  // Collect key counts per document for frequency distribution
  const keyCountsPerDocument = collectKeyCountsPerDocument(
    documents,
    fieldPath,
  );

  // If forced dynamic, skip pattern detection
  if (override === "dynamic") {
    logger.debug("Field path forced as dynamic keys", { fieldPath });

    const valueSchema = analyzeValueTypes(documents, fieldPath, uniqueKeys);

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
      keyCountsPerDocument,
      documents.length,
      valueSchema,
    );

    return {
      fieldPath,
      uniqueKeys,
      keyCountsPerDocument,
      isDynamic: true,
      detection,
      metadata,
      valueSchema,
    };
  }

  // Run pattern detection
  const keys = Array.from(uniqueKeys);
  const detection = detectDynamicKeys(keys, config);

  logger.debug("Dynamic key detection result", {
    fieldPath,
    detected: detection.detected,
    pattern: detection.pattern,
    confidence: detection.confidence,
    totalKeys: detection.totalKeys,
  });

  if (!detection.detected) {
    return {
      fieldPath,
      uniqueKeys,
      keyCountsPerDocument,
      isDynamic: false,
      detection,
    };
  }

  // Analyze value types for detected dynamic keys
  const valueSchema = analyzeValueTypes(documents, fieldPath, uniqueKeys);

  // Build complete metadata
  const metadata = buildDynamicKeyMetadata(
    detection,
    keyCountsPerDocument,
    documents.length,
    valueSchema,
  );

  logger.info("Dynamic keys detected", {
    fieldPath,
    pattern: metadata.pattern,
    confidence: metadata.confidence,
    uniqueKeys: metadata.uniqueKeysObserved,
  });

  return {
    fieldPath,
    uniqueKeys,
    keyCountsPerDocument,
    isDynamic: true,
    detection,
    metadata,
    valueSchema,
  };
}
