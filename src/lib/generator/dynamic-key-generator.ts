/**
 * Dynamic key generator for synthetic document generation
 * Feature: 002-dynamic-key-inference
 *
 * Generates synthetic keys matching detected patterns (UUID, ObjectId, etc.)
 * and corresponding values based on inferred type distributions
 */

import { faker } from '@faker-js/faker';
import { sampleFromDistribution } from '../../utils/frequency-map.js';
import { generateTimestampPrefixedObjectId } from './custom-formats.js';
import type {
  DynamicKeyPattern,
  DynamicKeyValueSchema,
  FrequencyDistribution,
} from '../../types/dynamic-keys.js';
import { logger } from '../../utils/logger.js';

/**
 * Dynamic key generator with uniqueness guarantee
 * Uses deterministic seeded generation with counter
 */
export class DynamicKeyGenerator {
  private counter = 0;

  /**
   * Reset counter (useful for testing or new document batches)
   */
  reset(): void {
    this.counter = 0;
  }

  /**
   * Generate a single dynamic key matching the pattern
   *
   * @param pattern - Detected pattern type
   * @param customPattern - Optional custom regex pattern (for CUSTOM type)
   * @param seed - Optional seed for deterministic generation
   * @returns Generated key string
   */
  generateKey(
    pattern: DynamicKeyPattern,
    customPattern?: string,
    seed?: number
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
   * Generate multiple dynamic keys
   *
   * @param count - Number of keys to generate
   * @param pattern - Detected pattern type
   * @param customPattern - Optional custom regex pattern
   * @param seed - Optional seed for deterministic generation
   * @returns Array of generated keys
   */
  generateKeys(
    count: number,
    pattern: DynamicKeyPattern,
    customPattern?: string,
    seed?: number
  ): string[] {
    const keys: string[] = [];
    const generatedSet = new Set<string>();

    // Generate keys with uniqueness guarantee
    while (keys.length < count) {
      const key = this.generateKey(pattern, customPattern, seed);

      // Ensure uniqueness (unlikely collision, but defensive)
      if (!generatedSet.has(key)) {
        keys.push(key);
        generatedSet.add(key);
      }
    }

    return keys;
  }

  /**
   * Pattern-specific key generation
   */
  private generateKeyByPattern(
    pattern: DynamicKeyPattern,
    customPattern?: string
  ): string {
    switch (pattern) {
      case 'UUID':
        return faker.string.uuid();

      case 'MONGODB_OBJECTID':
        return generateTimestampPrefixedObjectId();

      case 'ULID':
        return this.generateULID();

      case 'NUMERIC_ID':
        return faker.number.int({ min: 100000, max: 999999999 }).toString();

      case 'PREFIXED_ID':
        return this.generatePrefixedID();

      case 'CUSTOM':
        // Use custom pattern or fallback to alphanumeric
        return this.generateCustomKey(customPattern);

      default:
        logger.warn('Unknown pattern type, using alphanumeric', { pattern });
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
    const prefixes = ['user', 'doc', 'item', 'order'];
    const prefix = faker.helpers.arrayElement(prefixes);
    const suffix = faker.string.alphanumeric(16).toLowerCase();

    return `${prefix}_${suffix}`;
  }

  /**
   * Generate custom key based on pattern
   * Falls back to alphanumeric if pattern is not provided
   */
  private generateCustomKey(customPattern?: string): string {
    // TODO: Future enhancement - parse customPattern and generate matching string
    // For now, use alphanumeric with random length between 8-32
    const length = faker.number.int({ min: 8, max: 32 });
    return faker.string.alphanumeric(length);
  }

  /**
   * Base32 encoding helper for ULID
   */
  private base32Encode(value: number, length: number): string {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let result = '';
    let num = value;

    for (let i = 0; i < length; i++) {
      const remainder = num % 32;
      result = alphabet[remainder] + result;
      num = Math.floor(num / 32);
    }

    return result.padStart(length, '0');
  }
}

/**
 * Generate values for dynamic keys based on value schema
 *
 * @param valueSchema - Schema describing value types and probabilities
 * @param keyName - The generated key name (for logging/debugging)
 * @returns Generated value matching the schema
 */
export function generateDynamicKeyValue(
  valueSchema: DynamicKeyValueSchema,
  keyName?: string
): any {
  // Handle edge case: empty or invalid schema
  if (
    !valueSchema.types ||
    valueSchema.types.length === 0 ||
    !valueSchema.schemas
  ) {
    logger.warn('Invalid value schema for dynamic key, using null', { keyName });
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
    valueSchema.typeProbabilities
  );

  const selectedType = valueSchema.types[typeIndex];
  const selectedSchema = valueSchema.schemas[typeIndex];

  logger.debug('Sampled value type for dynamic key', {
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
  probabilities: number[]
): number {
  // Validate inputs
  if (types.length !== probabilities.length) {
    logger.warn('Mismatched types and probabilities length, using first type');
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
    logger.warn('Failed to sample type from probabilities, using first type', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Generate value from JSON Schema
 * Simple implementation - returns basic values based on type
 */
function generateValueFromSchema(schema: any): any {
  if (!schema || !schema.type) {
    return null;
  }

  switch (schema.type) {
    case 'string':
      return generateStringValue(schema);

    case 'number':
    case 'integer':
      return generateNumberValue(schema);

    case 'boolean':
      return faker.datatype.boolean();

    case 'object':
      return generateObjectValue(schema);

    case 'array':
      return generateArrayValue(schema);

    case 'null':
      return null;

    default:
      logger.warn('Unknown schema type, returning null', { type: schema.type });
      return null;
  }
}

/**
 * Generate string value from schema
 */
function generateStringValue(schema: any): string {
  // Handle format hints
  if (schema.format) {
    switch (schema.format) {
      case 'email':
        return faker.internet.email();
      case 'uuid':
        return faker.string.uuid();
      case 'date-time':
        return faker.date.recent().toISOString();
      case 'uri':
        return faker.internet.url();
      default:
        // Fall through to default string
        break;
    }
  }

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    return faker.helpers.arrayElement(schema.enum);
  }

  // Default string
  const minLength = schema.minLength || 1;
  const maxLength = schema.maxLength || 50;
  const length = faker.number.int({ min: minLength, max: maxLength });

  return faker.string.alphanumeric(length);
}

/**
 * Generate number value from schema
 */
function generateNumberValue(schema: any): number {
  const minimum = schema.minimum ?? 0;
  const maximum = schema.maximum ?? 1000;

  if (schema.type === 'integer') {
    return faker.number.int({ min: minimum, max: maximum });
  }

  return faker.number.float({
    min: minimum,
    max: maximum,
    fractionDigits: 2,
  });
}

/**
 * Generate object value from schema
 */
function generateObjectValue(schema: any): any {
  const obj: any = {};

  if (!schema.properties) {
    return obj;
  }

  // Generate each property
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    obj[key] = generateValueFromSchema(propSchema);
  }

  return obj;
}

/**
 * Generate array value from schema
 */
function generateArrayValue(schema: any): any[] {
  const minItems = schema.minItems || 0;
  const maxItems = schema.maxItems || 5;
  const length = faker.number.int({ min: minItems, max: maxItems });

  const items: any[] = [];

  for (let i = 0; i < length; i++) {
    if (schema.items) {
      items.push(generateValueFromSchema(schema.items));
    } else {
      items.push(null);
    }
  }

  return items;
}

/**
 * Select key count from frequency distribution
 *
 * @param countDistribution - Frequency distribution of key counts
 * @returns Sampled key count
 */
export function selectKeyCount(countDistribution: FrequencyDistribution): number {
  try {
    return sampleFromDistribution(countDistribution);
  } catch (error) {
    logger.warn('Failed to sample key count from distribution, using default 10', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 10;
  }
}

/**
 * Validate that generated keys match expected pattern
 *
 * @param keys - Generated keys to validate
 * @param pattern - Expected pattern type
 * @param customPattern - Optional custom regex pattern
 * @returns Validation result with details
 */
export function validateGeneratedKeys(
  keys: string[],
  pattern: DynamicKeyPattern,
  customPattern?: string
): { valid: boolean; invalidKeys: string[]; matchRate: number } {
  if (keys.length === 0) {
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
  customPattern?: string
): RegExp | null {
  switch (pattern) {
    case 'UUID':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    case 'MONGODB_OBJECTID':
      return /^[0-9a-f]{24}$/i;

    case 'ULID':
      return /^[0-9A-Z]{26}$/;

    case 'NUMERIC_ID':
      return /^\d{6,20}$/;

    case 'PREFIXED_ID':
      return /^(user|doc|item|order)_[a-z0-9]{8,32}$/i;

    case 'CUSTOM':
      if (customPattern) {
        try {
          return new RegExp(customPattern);
        } catch (error) {
          logger.warn('Invalid custom pattern regex', {
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
