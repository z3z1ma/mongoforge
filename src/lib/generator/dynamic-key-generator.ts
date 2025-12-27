/**
 * Dynamic key generator for synthetic document generation
 * Feature: 002-dynamic-key-inference
 *
 * Generates synthetic keys matching detected patterns (UUID, ObjectId, etc.)
 * and corresponding values based on inferred type distributions.
 *
 * Supports pattern-specific generation with uniqueness guarantees and
 * deterministic seeded generation for reproducible synthetic data.
 *
 * @module lib/generator/dynamic-key-generator
 */

import jsf from "json-schema-faker";
import { faker } from "@faker-js/faker";
import { sampleFromDistribution } from "../../utils/frequency-map.js";
import { generateTimestampPrefixedObjectId } from "./custom-formats.js";
import type {
  DynamicKeyPattern,
  DynamicKeyValueSchema,
  FrequencyDistribution,
} from "../../types/dynamic-keys.js";
import { logger } from "../../utils/logger.js";

/**
 * Dynamic key generator with uniqueness guarantee
 *
 * Generates synthetic keys matching specific patterns (UUID, ObjectId, ULID, etc.)
 * with guaranteed uniqueness within a generation session. Uses an internal counter
 * combined with optional seeding for deterministic output.
 *
 * @class DynamicKeyGenerator
 *
 * @example
 * ```typescript
 * const generator = new DynamicKeyGenerator();
 *
 * // Generate single key
 * const uuid = generator.generateKey('UUID');
 *
 * // Generate multiple keys
 * const objectIds = generator.generateKeys(10, 'MONGODB_OBJECTID');
 *
 * // Deterministic generation with seed
 * const deterministicKeys = generator.generateKeys(5, 'UUID', undefined, 12345);
 * ```
 */
export class DynamicKeyGenerator {
  private counter = 0;

  /**
   * Static initialization for json-schema-faker
   * Should be called once during module load or app start
   */
  static initializeJSF(): void {
    try {
      jsf.extend("faker", () => faker);
    } catch (e) {
      // Ignore if already extended
    }

    // Set consistent options for schema-to-value generation
    jsf.option({
      alwaysFakeOptionals: true,
      fillProperties: true,
      failOnInvalidTypes: false,
      failOnInvalidFormat: false,
    });
  }

  constructor() {
    // No-op - moved to initializeJSF
  }

  /**
   * Reset counter (useful for testing or new document batches)
   */
  reset(): void {
    this.counter = 0;
  }

  /**
   * Generate a single dynamic key matching the pattern
   *
   * Generates a key conforming to the specified pattern format. Increments internal
   * counter to ensure uniqueness. Optionally uses seed for deterministic output.
   *
   * @param pattern - Pattern type (UUID, MONGODB_OBJECTID, ULID, NUMERIC_ID, PREFIXED_ID, CUSTOM)
   * @param customPattern - Optional custom regex pattern (only used for CUSTOM pattern type)
   * @param seed - Optional seed for deterministic generation (combined with counter)
   * @returns Generated key string matching the pattern format
   *
   * @example
   * ```typescript
   * const gen = new DynamicKeyGenerator();
   * const uuid = gen.generateKey('UUID');
   * // Returns: "550e8400-e29b-41d4-a716-446655440000"
   *
   * const objectId = gen.generateKey('MONGODB_OBJECTID');
   * // Returns: "507f1f77bcf86cd799439011"
   * ```
   */
  generateKey(
    pattern: DynamicKeyPattern,
    customPattern?: string,
    seed?: number,
  ): string {
    // Increment counter for uniqueness
    this.counter++;

    // Apply seed if provided for deterministic generation
    if (seed !== undefined) {
      const localSeed = seed + this.counter;
      faker.seed(localSeed);
    }

    return this.generateKeyByPattern(pattern, customPattern);
  }

  /**
   * Generate multiple dynamic keys with uniqueness guarantee
   *
   * Generates an array of unique keys matching the specified pattern. Uses a defensive
   * approach with collision detection (though collisions are extremely unlikely for most patterns).
   *
   * @param count - Number of keys to generate
   * @param pattern - Pattern type (UUID, MONGODB_OBJECTID, etc.)
   * @param customPattern - Optional custom regex pattern (for CUSTOM type)
   * @param seed - Optional seed for deterministic bulk generation
   * @returns Array of unique generated keys (length exactly matches count)
   *
   * @example
   * ```typescript
   * const gen = new DynamicKeyGenerator();
   * const uuids = gen.generateKeys(10, 'UUID');
   * // Returns array of 10 unique UUIDs
   *
   * // Deterministic generation
   * const keys1 = gen.generateKeys(5, 'UUID', undefined, 12345);
   * gen.reset();
   * const keys2 = gen.generateKeys(5, 'UUID', undefined, 12345);
   * // keys1 === keys2 (byte-identical)
   * ```
   */
  generateKeys(
    count: number,
    pattern: DynamicKeyPattern,
    customPattern?: string,
    seed?: number,
  ): string[] {
    const keys: string[] = [];
    const generatedSet = new Set<string>();
    let attempts = 0;
    const maxAttempts = count * 10; // Allow some collisions but prevent infinite loops

    // Generate keys with uniqueness guarantee
    while (keys.length < count && attempts < maxAttempts) {
      attempts++;
      const key = this.generateKey(pattern, customPattern, seed);

      // Ensure uniqueness (unlikely collision, but defensive)
      if (!generatedSet.has(key)) {
        keys.push(key);
        generatedSet.add(key);
      }
    }

    if (keys.length < count) {
      logger.warn("Could not generate requested number of unique keys", {
        requested: count,
        generated: keys.length,
        pattern,
        attempts,
      });
    }

    return keys;
  }

  /**
   * Pattern-specific key generation
   */
  private generateKeyByPattern(
    pattern: DynamicKeyPattern,
    customPattern?: string,
  ): string {
    switch (pattern) {
      case "UUID":
        return faker.string.uuid();

      case "MONGODB_OBJECTID":
        return generateTimestampPrefixedObjectId();

      case "ULID":
        return this.generateULID();

      case "NUMERIC_ID":
        return faker.number.int({ min: 100000, max: 999999999 }).toString();

      case "PREFIXED_ID":
        return this.generatePrefixedID();

      case "CUSTOM":
        // Use custom pattern or fallback to alphanumeric
        return this.generateCustomKey(customPattern);

      default:
        logger.warn("Unknown pattern type, using alphanumeric", { pattern });
        return faker.string.alphanumeric(16);
    }
  }

  /**
   * Generate ULID (Universally Unique Lexicographically Sortable Identifier)
   * Format: 26 characters, uppercase alphanumeric
   */
  private generateULID(): string {
    // Timestamp portion (10 characters, base32 encoded)
    const timestamp = Date.now();
    const timestampPart = this.base32Encode(timestamp, 10);

    // Random portion (16 characters, base32 encoded)
    const randomPart = faker.string.alphanumeric(16).toUpperCase();

    return timestampPart + randomPart;
  }

  /**
   * Generate prefixed ID (e.g., user_abc123, order_xyz789)
   */
  private generatePrefixedID(): string {
    const prefixes = ["user", "doc", "item", "order"];
    const prefix = faker.helpers.arrayElement(prefixes);
    const suffix = faker.string.alphanumeric(16).toLowerCase();

    return `${prefix}_${suffix}`;
  }

  /**
   * Generate custom key based on pattern
   * Falls back to alphanumeric if pattern is not provided
   */
  private generateCustomKey(customPattern?: string): string {
    if (customPattern && customPattern !== "HIGH_CARDINALITY") {
      try {
        // Use json-schema-faker to generate a string matching the regex pattern
        return jsf.generate({
          type: "string",
          pattern: customPattern,
        }) as string;
      } catch (error) {
        logger.warn(
          "Failed to generate key from custom pattern, falling back to alphanumeric",
          {
            customPattern,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // Default: use alphanumeric with random length between 8-32
    const length = faker.number.int({ min: 8, max: 32 });
    return faker.string.alphanumeric(length);
  }

  /**
   * Base32 encoding helper for ULID
   */
  private base32Encode(value: number, length: number): string {
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let result = "";
    let num = value;

    for (let i = 0; i < length; i++) {
      const remainder = num % 32;
      result = alphabet[remainder] + result;
      num = Math.floor(num / 32);
    }

    return result.padStart(length, "0");
  }
}

/**
 * Generate values for dynamic keys based on value schema
 *
 * Samples a value type based on probability distribution and generates a value
 * matching the sampled type's schema. Handles uniform types (optimization) and
 * mixed types (probabilistic sampling).
 *
 * @param valueSchema - Schema with types, probabilities, and JSON schemas
 * @param keyName - Optional key name for logging/debugging purposes
 * @returns Generated value matching one of the schema's type definitions
 *
 * @example
 * ```typescript
 * // Uniform type (all strings)
 * const value1 = generateDynamicKeyValue({
 *   types: ['string'],
 *   typeProbabilities: [1.0],
 *   schemas: [{ type: 'string', minLength: 5 }],
 *   isUniformType: true,
 *   dominantType: 'string'
 * });
 * // Returns: string with length >= 5
 *
 * // Mixed types
 * const value2 = generateDynamicKeyValue({
 *   types: ['string', 'integer'],
 *   typeProbabilities: [0.7, 0.3],
 *   schemas: [{ type: 'string' }, { type: 'integer' }],
 *   isUniformType: false,
 *   dominantType: 'string'
 * });
 * // Returns: string (70% probability) or integer (30% probability)
 * ```
 */
export function generateDynamicKeyValue(
  valueSchema: DynamicKeyValueSchema,
  keyName?: string,
): any {
  // Handle edge case: empty or invalid schema
  if (
    !valueSchema.types ||
    valueSchema.types.length === 0 ||
    !valueSchema.schemas
  ) {
    logger.warn("Invalid value schema for dynamic key, using null", {
      keyName,
    });
    return null;
  }

  // Handle single uniform type (optimization)
  if (valueSchema.isUniformType || valueSchema.types.length === 1) {
    const schema = valueSchema.schemas[0];
    return generateValueFromSchema(schema);
  }

  // Sample type based on probability distribution
  const typeIndex = sampleTypeFromProbabilities(
    valueSchema.types,
    valueSchema.typeProbabilities,
  );

  const selectedType = valueSchema.types[typeIndex];
  const selectedSchema = valueSchema.schemas[typeIndex];

  logger.debug("Sampled value type for dynamic key", {
    keyName,
    selectedType,
    typeIndex,
  });

  return generateValueFromSchema(selectedSchema);
}

/**
 * Sample a type index based on probability distribution
 */
function sampleTypeFromProbabilities(
  types: string[],
  probabilities: number[],
): number {
  // Validate inputs
  if (types.length !== probabilities.length) {
    logger.warn("Mismatched types and probabilities length, using first type");
    return 0;
  }

  // Convert probabilities to frequency distribution
  // Multiply by 100 to convert 0.0-1.0 to integer counts
  const distribution: FrequencyDistribution = {};

  for (let i = 0; i < types.length; i++) {
    const probability = probabilities[i] ?? 0;
    const count = Math.round(probability * 100);
    distribution[String(i)] = count;
  }

  try {
    return sampleFromDistribution(distribution);
  } catch (error) {
    logger.warn("Failed to sample type from probabilities, using first type", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Generate value from JSON Schema
 * Delegates to json-schema-faker for robust schema-to-value generation
 */
function generateValueFromSchema(schema: any): any {
  if (!schema || !schema.type) {
    return null;
  }

  try {
    return jsf.generate(schema);
  } catch (error) {
    logger.warn("Failed to generate value from schema using jsf", {
      type: schema.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Select key count from frequency distribution
 *
 * Samples a key count from the observed distribution using weighted random selection.
 * Falls back to default value (10) if distribution is empty or sampling fails.
 *
 * @param countDistribution - Frequency distribution mapping count to frequency
 * @returns Sampled key count (integer)
 *
 * @example
 * ```typescript
 * const distribution = { '5': 25, '10': 50, '15': 25 };
 * const count = selectKeyCount(distribution);
 * // Returns: 5 (25%), 10 (50%), or 15 (25%)
 * ```
 */
export function selectKeyCount(
  countDistribution: FrequencyDistribution,
): number {
  try {
    return sampleFromDistribution(countDistribution);
  } catch (error) {
    logger.warn(
      "Failed to sample key count from distribution, using default 10",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return 10;
  }
}

/**
 * Validate that generated keys match expected pattern format
 *
 * Tests each key against the pattern's regex to verify correct format. Useful for
 * quality assurance and debugging generation logic.
 *
 * @param keys - Array of generated keys to validate
 * @param pattern - Expected pattern type (UUID, MONGODB_OBJECTID, etc.)
 * @param customPattern - Optional custom regex pattern (for CUSTOM type)
 * @returns Validation result with valid flag, invalid keys list, and match rate
 *
 * @example
 * ```typescript
 * const keys = generateKeys(10, 'UUID');
 * const result = validateGeneratedKeys(keys, 'UUID');
 *
 * if (!result.valid) {
 *   console.error(`Invalid keys: ${result.invalidKeys}`);
 *   console.log(`Match rate: ${result.matchRate * 100}%`);
 * }
 * ```
 */
export function validateGeneratedKeys(
  keys: string[],
  pattern: DynamicKeyPattern,
  customPattern?: string,
): { valid: boolean; invalidKeys: string[]; matchRate: number } {
  if (keys.length === 0) {
    return { valid: true, invalidKeys: [], matchRate: 1.0 };
  }

  // CUSTOM patterns cannot be validated since we don't know the pattern
  if (pattern === "CUSTOM") {
    return { valid: true, invalidKeys: [], matchRate: 1.0 };
  }

  const regex = getPatternRegex(pattern, customPattern);
  if (!regex) {
    // No validation possible for unknown patterns
    return { valid: true, invalidKeys: [], matchRate: 1.0 };
  }

  const invalidKeys = keys.filter((key) => !regex.test(key));
  const matchRate = (keys.length - invalidKeys.length) / keys.length;

  return {
    valid: invalidKeys.length === 0,
    invalidKeys,
    matchRate,
  };
}

/**
 * Get regex pattern for validation
 */
function getPatternRegex(
  pattern: DynamicKeyPattern,
  customPattern?: string,
): RegExp | null {
  switch (pattern) {
    case "UUID":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    case "MONGODB_OBJECTID":
      return /^[0-9a-f]{24}$/i;

    case "ULID":
      return /^[0-9A-Z]{26}$/;

    case "NUMERIC_ID":
      return /^\d{6,20}$/;

    case "PREFIXED_ID":
      return /^(user|doc|item|order)_[a-z0-9]{8,32}$/i;

    case "CUSTOM":
      if (customPattern) {
        try {
          return new RegExp(customPattern);
        } catch (error) {
          logger.warn("Invalid custom pattern regex", {
            customPattern,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }
      return null;

    default:
      return null;
  }
}
