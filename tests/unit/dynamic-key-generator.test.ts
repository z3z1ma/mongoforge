/**
 * Unit tests for dynamic key generator
 * Feature: 002-dynamic-key-inference
 * Task: T055
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DynamicKeyGenerator,
  generateDynamicKeyValue,
  selectKeyCount,
  validateGeneratedKeys,
} from '../../src/lib/generator/dynamic-key-generator.js';
import type { DynamicKeyValueSchema, FrequencyDistribution } from '../../src/types/dynamic-keys.js';

describe('Dynamic Key Generator', () => {
  describe('DynamicKeyGenerator class', () => {
    let generator: DynamicKeyGenerator;

    beforeEach(() => {
      generator = new DynamicKeyGenerator();
    });

    describe('generateKey', () => {
      it('should generate UUID pattern', () => {
        const key = generator.generateKey('UUID');

        expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      });

      it('should generate MongoDB ObjectId pattern', () => {
        const key = generator.generateKey('MONGODB_OBJECTID');

        expect(key).toMatch(/^[0-9a-f]{24}$/i);
        expect(key).toHaveLength(24);
      });

      it('should generate ULID pattern', () => {
        const key = generator.generateKey('ULID');

        expect(key).toMatch(/^[0-9A-Z]{26}$/);
        expect(key).toHaveLength(26);
      });

      it('should generate numeric ID pattern', () => {
        const key = generator.generateKey('NUMERIC_ID');

        expect(key).toMatch(/^\d{6,20}$/);
        const num = parseInt(key, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThanOrEqual(999999999);
      });

      it('should generate prefixed ID pattern', () => {
        const key = generator.generateKey('PREFIXED_ID');

        expect(key).toMatch(/^(user|doc|item|order)_[a-z0-9]{16}$/i);
      });

      it('should generate custom pattern key with regex', () => {
        const key = generator.generateKey('CUSTOM', '^KEY-[0-9]{5}$');

        expect(key).toMatch(/^KEY-[0-9]{5}$/);
      });

      it('should fallback to alphanumeric for CUSTOM without pattern', () => {
        const key = generator.generateKey('CUSTOM');

        expect(key).toMatch(/^[a-z0-9]+$/i);
        expect(key.length).toBeGreaterThanOrEqual(8);
        expect(key.length).toBeLessThanOrEqual(32);
      });

      it('should use seed for deterministic generation', () => {
        const gen1 = new DynamicKeyGenerator();
        const gen2 = new DynamicKeyGenerator();

        const key1 = gen1.generateKey('UUID', undefined, 12345);
        const key2 = gen2.generateKey('UUID', undefined, 12345);

        expect(key1).toBe(key2);
      });

      it('should generate unique keys with counter', () => {
        const keys = new Set<string>();

        for (let i = 0; i < 100; i++) {
          const key = generator.generateKey('UUID');
          keys.add(key);
        }

        // All keys should be unique
        expect(keys.size).toBe(100);
      });
    });

    describe('generateKeys', () => {
      it('should generate multiple UUID keys', () => {
        const keys = generator.generateKeys(10, 'UUID');

        expect(keys).toHaveLength(10);
        keys.forEach((key) => {
          expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        });
      });

      it('should generate multiple ObjectId keys', () => {
        const keys = generator.generateKeys(5, 'MONGODB_OBJECTID');

        expect(keys).toHaveLength(5);
        keys.forEach((key) => {
          expect(key).toMatch(/^[0-9a-f]{24}$/i);
        });
      });

      it('should guarantee uniqueness across generated keys', () => {
        const keys = generator.generateKeys(50, 'UUID');
        const uniqueKeys = new Set(keys);

        expect(uniqueKeys.size).toBe(50);
      });

      it('should use seed for deterministic bulk generation', () => {
        const gen1 = new DynamicKeyGenerator();
        const gen2 = new DynamicKeyGenerator();

        const keys1 = gen1.generateKeys(10, 'UUID', undefined, 54321);
        const keys2 = gen2.generateKeys(10, 'UUID', undefined, 54321);

        expect(keys1).toEqual(keys2);
      });

      it('should handle zero count', () => {
        const keys = generator.generateKeys(0, 'UUID');

        expect(keys).toHaveLength(0);
      });

      it('should handle large counts', () => {
        const keys = generator.generateKeys(1000, 'NUMERIC_ID');

        expect(keys).toHaveLength(1000);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(1000);
      });
    });

    describe('reset', () => {
      it('should reset counter', () => {
        // Generate some keys to increment counter
        generator.generateKeys(10, 'UUID');

        // Reset counter
        generator.reset();

        // Generate with seed should produce same result as fresh generator
        const gen2 = new DynamicKeyGenerator();
        const key1 = generator.generateKey('UUID', undefined, 99999);
        const key2 = gen2.generateKey('UUID', undefined, 99999);

        expect(key1).toBe(key2);
      });
    });
  });

  describe('generateDynamicKeyValue', () => {
    it('should generate value from uniform string schema', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['string'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'string', minLength: 5, maxLength: 10 }],
        isUniformType: true,
        dominantType: 'string',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(typeof value).toBe('string');
    });

    it('should generate value from uniform number schema', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['number'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'number', minimum: 0, maximum: 100 }],
        isUniformType: true,
        dominantType: 'number',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    });

    it('should generate value from uniform integer schema', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['integer'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'integer', minimum: 1, maximum: 10 }],
        isUniformType: true,
        dominantType: 'integer',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(10);
    });

    it('should generate value from uniform boolean schema', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['boolean'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'boolean' }],
        isUniformType: true,
        dominantType: 'boolean',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(typeof value).toBe('boolean');
    });

    it('should generate null from null schema', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['null'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'null' }],
        isUniformType: true,
        dominantType: 'null',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(value).toBe(null);
    });

    it('should generate array from array schema', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['array'],
        typeProbabilities: [1.0],
        schemas: [
          {
            type: 'array',
            minItems: 2,
            maxItems: 5,
            items: { type: 'number' },
          },
        ],
        isUniformType: true,
        dominantType: 'array',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(Array.isArray(value)).toBe(true);
      expect(value.length).toBeGreaterThanOrEqual(2);
      expect(value.length).toBeLessThanOrEqual(5);
    });

    it('should generate object from object schema', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['object'],
        typeProbabilities: [1.0],
        schemas: [
          {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
            },
            required: ['name', 'age'],
          },
        ],
        isUniformType: true,
        dominantType: 'object',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(typeof value).toBe('object');
      expect(value).not.toBe(null);
      expect(value).toHaveProperty('name');
      expect(value).toHaveProperty('age');
    });

    it('should sample from mixed value types', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['string', 'integer'],
        typeProbabilities: [0.6, 0.4],
        schemas: [{ type: 'string' }, { type: 'integer' }],
        isUniformType: false,
        dominantType: 'string',
      };

      // Generate multiple samples to test probability distribution
      const samples: any[] = [];
      for (let i = 0; i < 100; i++) {
        samples.push(generateDynamicKeyValue(valueSchema));
      }

      const stringCount = samples.filter((v) => typeof v === 'string').length;
      const integerCount = samples.filter((v) => typeof v === 'number').length;

      // Both types should be represented
      expect(stringCount).toBeGreaterThan(0);
      expect(integerCount).toBeGreaterThan(0);
      expect(stringCount + integerCount).toBe(100);
    });

    it('should handle empty schema gracefully', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: [],
        typeProbabilities: [],
        schemas: [],
        isUniformType: true,
        dominantType: 'unknown',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(value).toBe(null);
    });

    it('should handle string with format hints', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['string'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'string', format: 'email' }],
        isUniformType: true,
        dominantType: 'string',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(typeof value).toBe('string');
      expect(value).toContain('@');
    });

    it('should handle string enum', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['string'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'string', enum: ['red', 'green', 'blue'] }],
        isUniformType: true,
        dominantType: 'string',
      };

      const value = generateDynamicKeyValue(valueSchema);

      expect(['red', 'green', 'blue']).toContain(value);
    });
  });

  describe('selectKeyCount', () => {
    it('should select count from distribution', () => {
      const distribution: FrequencyDistribution = {
        '5': 25,
        '10': 50,
        '15': 25,
      };

      const counts = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const count = selectKeyCount(distribution);
        counts.add(count);
      }

      // Should have sampled all possible counts
      expect(counts.has(5)).toBe(true);
      expect(counts.has(10)).toBe(true);
      expect(counts.has(15)).toBe(true);
    });

    it('should return same value for single-value distribution', () => {
      const distribution: FrequencyDistribution = {
        '42': 100,
      };

      for (let i = 0; i < 10; i++) {
        const count = selectKeyCount(distribution);
        expect(count).toBe(42);
      }
    });

    it('should handle empty distribution with default fallback', () => {
      const distribution: FrequencyDistribution = {};

      const count = selectKeyCount(distribution);

      expect(count).toBe(10); // Default fallback
    });

    it('should respect frequency weights', () => {
      const distribution: FrequencyDistribution = {
        '1': 90,
        '100': 10,
      };

      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        samples.push(selectKeyCount(distribution));
      }

      const count1 = samples.filter((s) => s === 1).length;
      const count100 = samples.filter((s) => s === 100).length;

      // 1 should appear much more frequently than 100
      expect(count1).toBeGreaterThan(count100);
    });
  });

  describe('validateGeneratedKeys', () => {
    it('should validate UUID keys', () => {
      const keys = [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
      ];

      const result = validateGeneratedKeys(keys, 'UUID');

      expect(result.valid).toBe(true);
      expect(result.invalidKeys).toHaveLength(0);
      expect(result.matchRate).toBe(1.0);
    });

    it('should detect invalid UUID keys', () => {
      const keys = [
        '550e8400-e29b-41d4-a716-446655440001',
        'not-a-uuid',
        '550e8400-e29b-41d4-a716-446655440002',
      ];

      const result = validateGeneratedKeys(keys, 'UUID');

      expect(result.valid).toBe(false);
      expect(result.invalidKeys).toEqual(['not-a-uuid']);
      expect(result.matchRate).toBeCloseTo(0.667, 2);
    });

    it('should validate MongoDB ObjectId keys', () => {
      const keys = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      ];

      const result = validateGeneratedKeys(keys, 'MONGODB_OBJECTID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should validate ULID keys', () => {
      const keys = [
        '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        '01F8MECHZX3TBDSZ7XR8MAV654',
      ];

      const result = validateGeneratedKeys(keys, 'ULID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should validate numeric ID keys', () => {
      const keys = ['123456', '7890123', '99999999'];

      const result = validateGeneratedKeys(keys, 'NUMERIC_ID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should validate prefixed ID keys', () => {
      const keys = ['user_abc12345', 'doc_xyz98765', 'item_123abcde'];

      const result = validateGeneratedKeys(keys, 'PREFIXED_ID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should handle custom pattern validation', () => {
      const keys = ['custom_123', 'custom_456'];
      const customPattern = '^custom_\\d{3}$';

      const result = validateGeneratedKeys(keys, 'CUSTOM', customPattern);

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should handle invalid custom pattern gracefully', () => {
      const keys = ['any', 'keys'];
      const invalidPattern = '[invalid(';

      const result = validateGeneratedKeys(keys, 'CUSTOM', invalidPattern);

      // Should not throw, returns valid=true when pattern can't be validated
      expect(result.valid).toBe(true);
    });

    it('should handle empty keys array', () => {
      const keys: string[] = [];

      const result = validateGeneratedKeys(keys, 'UUID');

      expect(result.valid).toBe(true);
      expect(result.invalidKeys).toHaveLength(0);
      expect(result.matchRate).toBe(1.0);
    });

    it('should calculate match rate correctly', () => {
      const keys = [
        '550e8400-e29b-41d4-a716-446655440001',
        'bad1',
        '550e8400-e29b-41d4-a716-446655440002',
        'bad2',
        '550e8400-e29b-41d4-a716-446655440003',
      ];

      const result = validateGeneratedKeys(keys, 'UUID');

      expect(result.matchRate).toBeCloseTo(0.6, 2); // 3 valid out of 5
      expect(result.invalidKeys).toHaveLength(2);
    });
  });

  describe('Integration: Generate and Validate', () => {
    it('should generate and validate UUID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(20, 'UUID');

      const result = validateGeneratedKeys(keys, 'UUID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should generate and validate ObjectId keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(15, 'MONGODB_OBJECTID');

      const result = validateGeneratedKeys(keys, 'MONGODB_OBJECTID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should generate and validate ULID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'ULID');

      const result = validateGeneratedKeys(keys, 'ULID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should generate and validate numeric ID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(25, 'NUMERIC_ID');

      const result = validateGeneratedKeys(keys, 'NUMERIC_ID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });

    it('should generate and validate prefixed ID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(30, 'PREFIXED_ID');

      const result = validateGeneratedKeys(keys, 'PREFIXED_ID');

      expect(result.valid).toBe(true);
      expect(result.matchRate).toBe(1.0);
    });
  });
});
