/**
 * Schema preprocessor for dynamic keys and advanced features
 * Feature: 002-dynamic-key-inference
 *
 * Preprocesses JSON Schema to expand x-dynamic-keys annotations into
 * static properties that json-schema-faker can process
 */

import {
  DynamicKeyGenerator,
  selectKeyCount,
  generateDynamicKeyValue,
  validateGeneratedKeys,
} from "./dynamic-key-generator.js";
import type { DynamicKeyMetadata } from "../../types/dynamic-keys.js";
import { logger } from "../../utils/logger.js";

/**
 * Options for schema preprocessing
 */
export interface PreprocessOptions {
  /** Seed for deterministic key generation */
  seed?: number;

  /** Whether to validate generated keys match expected patterns */
  validateKeys?: boolean;

  /** Maximum depth for recursive preprocessing (prevents infinite loops) */
  maxDepth?: number;
}

/**
 * Preprocess schema to expand dynamic keys
 *
 * @param schema - JSON Schema with optional x-dynamic-keys annotations
 * @param options - Preprocessing options
 * @returns Preprocessed schema with expanded static properties
 */
export function preprocessSchema(
  schema: any,
  options: PreprocessOptions = {},
): any {
  const { seed, validateKeys = true, maxDepth = 10 } = options;

  // Create generator instance for this preprocessing session
  const generator = new DynamicKeyGenerator();

  // Start recursive preprocessing
  return preprocessSchemaRecursive(
    schema,
    generator,
    { seed, validateKeys },
    0,
    maxDepth,
  );
}

/**
 * Recursively preprocess schema
 */
function preprocessSchemaRecursive(
  schema: any,
  generator: DynamicKeyGenerator,
  options: { seed?: number; validateKeys: boolean },
  depth: number,
  maxDepth: number,
): any {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    logger.warn("Maximum preprocessing depth reached, stopping recursion", {
      depth,
      maxDepth,
    });
    return schema;
  }

  // Handle non-object schemas
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  // Clone to avoid mutating original
  const processed = { ...schema };

  // Check for x-dynamic-keys annotation
  if (processed["x-dynamic-keys"]) {
    return expandDynamicKeys(processed, generator, options);
  }

  // Recursively process nested properties
  if (processed.properties) {
    processed.properties = Object.fromEntries(
      Object.entries(processed.properties).map(([key, value]) => [
        key,
        preprocessSchemaRecursive(
          value,
          generator,
          options,
          depth + 1,
          maxDepth,
        ),
      ]),
    );
  }

  // Recursively process array items
  if (processed.items) {
    if (Array.isArray(processed.items)) {
      // Tuple validation
      processed.items = processed.items.map((item: any) =>
        preprocessSchemaRecursive(
          item,
          generator,
          options,
          depth + 1,
          maxDepth,
        ),
      );
    } else {
      // Single item schema
      processed.items = preprocessSchemaRecursive(
        processed.items,
        generator,
        options,
        depth + 1,
        maxDepth,
      );
    }
  }

  // Recursively process additionalProperties
  if (
    processed.additionalProperties &&
    typeof processed.additionalProperties === "object"
  ) {
    processed.additionalProperties = preprocessSchemaRecursive(
      processed.additionalProperties,
      generator,
      options,
      depth + 1,
      maxDepth,
    );
  }

  // Recursively process oneOf/anyOf/allOf
  for (const combiner of ["oneOf", "anyOf", "allOf"]) {
    if (Array.isArray(processed[combiner])) {
      processed[combiner] = processed[combiner].map((subschema: any) =>
        preprocessSchemaRecursive(
          subschema,
          generator,
          options,
          depth + 1,
          maxDepth,
        ),
      );
    }
  }

  return processed;
}

/**
 * Expand x-dynamic-keys annotation into static properties
 *
 * @param schema - Schema with x-dynamic-keys annotation
 * @param generator - Dynamic key generator instance
 * @param options - Generation options
 * @returns Schema with expanded properties
 */
function expandDynamicKeys(
  schema: any,
  generator: DynamicKeyGenerator,
  options: { seed?: number; validateKeys: boolean },
): any {
  const dynamicKeysAnnotation = schema["x-dynamic-keys"];

  // Handle two possible structures:
  // 1. Synthesizer output: { enabled, metadata, valueSchema }
  // 2. Direct metadata: DynamicKeyMetadata
  const dynamicKeysConfig = (dynamicKeysAnnotation.metadata ||
    dynamicKeysAnnotation) as DynamicKeyMetadata;

  // Value schema can be in three places:
  // 1. dynamicKeysAnnotation.valueSchema (new synthesizer output)
  // 2. schema['x-dynamic-key-value-schema'] (old format, separate property)
  // 3. undefined (fallback to string)
  const valueSchema =
    dynamicKeysAnnotation.valueSchema || schema["x-dynamic-key-value-schema"];

  // Check if dynamic keys are enabled
  const enabled =
    dynamicKeysAnnotation.enabled !== undefined
      ? dynamicKeysAnnotation.enabled
      : dynamicKeysConfig.enabled;

  if (!enabled) {
    logger.debug("Dynamic keys disabled, skipping expansion");
    // Remove annotation but keep schema as-is
    const result = { ...schema };
    delete result["x-dynamic-keys"];
    return result;
  }

  logger.debug("Expanding dynamic keys", {
    pattern: dynamicKeysConfig.pattern,
    documentsAnalyzed: dynamicKeysConfig.documentsAnalyzed,
    uniqueKeysObserved: dynamicKeysConfig.uniqueKeysObserved,
  });

  // Select number of keys from distribution
  const keyCount = selectKeyCount(dynamicKeysConfig.countDistribution);

  logger.debug("Selected key count from distribution", { keyCount });

  // Generate synthetic keys
  const keys = generator.generateKeys(
    keyCount,
    dynamicKeysConfig.pattern,
    dynamicKeysConfig.customPattern,
    options.seed,
  );

  // Validate generated keys if requested
  if (options.validateKeys) {
    const validation = validateGeneratedKeys(
      keys,
      dynamicKeysConfig.pattern,
      dynamicKeysConfig.customPattern,
    );

    if (!validation.valid) {
      logger.warn("Generated keys failed validation", {
        pattern: dynamicKeysConfig.pattern,
        invalidCount: validation.invalidKeys.length,
        matchRate: validation.matchRate,
        exampleInvalid: validation.invalidKeys.slice(0, 5),
      });
    } else {
      logger.debug("Generated keys validated successfully", {
        pattern: dynamicKeysConfig.pattern,
        keyCount: keys.length,
      });
    }
  }

  // Build properties object with generated keys
  const properties: any = {};

  for (const key of keys) {
    if (valueSchema) {
      // Use value schema to generate appropriate schema for each key
      properties[key] = createSchemaFromValueSchema(valueSchema, key);
    } else {
      // Fallback: use generic string schema
      properties[key] = {
        type: "string",
      };
    }
  }

  // Create new schema with expanded properties
  const expanded = {
    type: "object",
    properties,
    required: keys, // All generated keys are required
    additionalProperties: schema.additionalProperties ?? false,
  };

  logger.debug("Dynamic keys expanded to static properties", {
    keyCount: keys.length,
    exampleKeys: keys.slice(0, 5),
  });

  return expanded;
}

/**
 * Create JSON Schema from DynamicKeyValueSchema
 *
 * @param valueSchema - Value schema with type distributions
 * @param keyName - The key name (for logging)
 * @returns JSON Schema for this key's value
 */
function createSchemaFromValueSchema(valueSchema: any, keyName: string): any {
  if (!valueSchema) {
    return { type: "string" };
  }

  // If uniform type, use the single schema
  if (valueSchema.isUniformType && valueSchema.schemas?.[0]) {
    return valueSchema.schemas[0];
  }

  // If multiple types, use anyOf with probability-based selection
  // Note: json-schema-faker doesn't natively support probabilities in anyOf,
  // but we can use this structure and handle it in value generation
  if (valueSchema.types?.length > 1 && valueSchema.schemas) {
    return {
      anyOf: valueSchema.schemas,
      "x-type-probabilities": valueSchema.typeProbabilities,
    };
  }

  // Fallback to first schema or string
  return valueSchema.schemas?.[0] || { type: "string" };
}

/**
 * Check if schema has dynamic keys annotation
 *
 * @param schema - JSON Schema to check
 * @returns True if schema has x-dynamic-keys annotation
 */
export function hasDynamicKeys(schema: any): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }

  return Boolean(schema["x-dynamic-keys"]?.enabled);
}

/**
 * Extract dynamic key metadata from schema
 *
 * @param schema - JSON Schema
 * @returns Dynamic key metadata if present, undefined otherwise
 */
export function extractDynamicKeyMetadata(
  schema: any,
): DynamicKeyMetadata | undefined {
  if (!hasDynamicKeys(schema)) {
    return undefined;
  }

  return schema["x-dynamic-keys"] as DynamicKeyMetadata;
}

/**
 * Count total dynamic keys across schema (including nested)
 *
 * @param schema - JSON Schema
 * @returns Count of schemas with dynamic keys
 */
export function countDynamicKeySchemas(schema: any): number {
  if (!schema || typeof schema !== "object") {
    return 0;
  }

  let count = 0;

  // Check current level
  if (hasDynamicKeys(schema)) {
    count++;
  }

  // Check nested properties
  if (schema.properties) {
    for (const propSchema of Object.values(schema.properties)) {
      count += countDynamicKeySchemas(propSchema);
    }
  }

  // Check array items
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      for (const item of schema.items) {
        count += countDynamicKeySchemas(item);
      }
    } else {
      count += countDynamicKeySchemas(schema.items);
    }
  }

  // Check additionalProperties
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    count += countDynamicKeySchemas(schema.additionalProperties);
  }

  // Check combiners
  for (const combiner of ["oneOf", "anyOf", "allOf"]) {
    if (Array.isArray(schema[combiner])) {
      for (const subschema of schema[combiner]) {
        count += countDynamicKeySchemas(subschema);
      }
    }
  }

  return count;
}

/**
 * Preprocess options with defaults
 */
export function getDefaultPreprocessOptions(): PreprocessOptions {
  return {
    validateKeys: true,
    maxDepth: 10,
  };
}
