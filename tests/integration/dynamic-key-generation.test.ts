/**
 * Dynamic Key Generation Integration Tests
 * Feature: 002-dynamic-key-inference
 *
 * Tests end-to-end generation of documents with dynamic keys
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DynamicKeyGenerator,
  selectKeyCount,
  generateDynamicKeyValue,
  validateGeneratedKeys,
} from '../../src/lib/generator/dynamic-key-generator.js';
import {
  preprocessSchema,
  hasDynamicKeys,
  countDynamicKeySchemas,
} from '../../src/lib/generator/schema-preprocessor.js';
import { generate } from '../../src/lib/generator/faker-engine.js';
import { initializeFaker } from '../../src/lib/generator/faker-engine.js';
import type {
  DynamicKeyMetadata,
  DynamicKeyValueSchema,
} from '../../src/types/dynamic-keys.js';

describe('Dynamic Key Generation - Integration', () => {
  beforeEach(() => {
    // Initialize faker before each test
    initializeFaker(12345);
  });

  describe('DynamicKeyGenerator', () => {
    it('should generate UUID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'UUID');

      expect(keys).toHaveLength(10);
      keys.forEach((key) => {
        expect(key).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });
    });

    it('should generate MongoDB ObjectId keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'MONGODB_OBJECTID');

      expect(keys).toHaveLength(10);
      keys.forEach((key) => {
        expect(key).toMatch(/^[0-9a-f]{24}$/i);
      });
    });

    it('should generate ULID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'ULID');

      expect(keys).toHaveLength(10);
      keys.forEach((key) => {
        expect(key).toMatch(/^[0-9A-Z]{26}$/);
      });
    });

    it('should generate numeric ID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'NUMERIC_ID');

      expect(keys).toHaveLength(10);
      keys.forEach((key) => {
        expect(key).toMatch(/^\d{6,20}$/);
      });
    });

    it('should generate prefixed ID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'PREFIXED_ID');

      expect(keys).toHaveLength(10);
      keys.forEach((key) => {
        expect(key).toMatch(/^(user|doc|item|order)_[a-z0-9]{16}$/i);
      });
    });

    it('should generate custom keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'CUSTOM');

      expect(keys).toHaveLength(10);
      keys.forEach((key) => {
        expect(key).toBeTruthy();
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThanOrEqual(8);
      });
    });

    it('should generate unique keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(100, 'UUID');

      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(100);
    });

    it('should be deterministic with seed', () => {
      const seed = 42;

      const gen1 = new DynamicKeyGenerator();
      const keys1 = gen1.generateKeys(10, 'UUID', undefined, seed);

      const gen2 = new DynamicKeyGenerator();
      const keys2 = gen2.generateKeys(10, 'UUID', undefined, seed);

      expect(keys1).toEqual(keys2);
    });
  });

  describe('Key Count Selection', () => {
    it('should sample from frequency distribution', () => {
      const distribution = {
        '5': 100,
        '10': 50,
        '15': 20,
      };

      const counts = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const count = selectKeyCount(distribution);
        counts.add(count);
        expect([5, 10, 15]).toContain(count);
      }

      // Should have sampled multiple different values
      expect(counts.size).toBeGreaterThan(1);
    });
  });

  describe('Value Generation', () => {
    it('should generate uniform type values', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['string'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'string', minLength: 5, maxLength: 10 }],
        isUniformType: true,
        dominantType: 'string',
      };

      const value = generateDynamicKeyValue(valueSchema, 'test-key');
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThanOrEqual(5);
      expect(value.length).toBeLessThanOrEqual(10);
    });

    it('should generate mixed type values based on probabilities', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['string', 'number'],
        typeProbabilities: [0.5, 0.5],
        schemas: [
          { type: 'string', minLength: 5, maxLength: 10 },
          { type: 'number', minimum: 0, maximum: 100 },
        ],
        isUniformType: false,
        dominantType: 'string',
      };

      const values = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const value = generateDynamicKeyValue(valueSchema, 'test-key');
        values.add(typeof value);
      }

      // Should have generated both types
      expect(values.has('string') || values.has('number')).toBe(true);
    });

    it('should handle object values', () => {
      const valueSchema: DynamicKeyValueSchema = {
        types: ['object'],
        typeProbabilities: [1.0],
        schemas: [
          {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        ],
        isUniformType: true,
        dominantType: 'object',
      };

      const value = generateDynamicKeyValue(valueSchema, 'test-key');
      expect(typeof value).toBe('object');
      expect(value).toHaveProperty('name');
      expect(value).toHaveProperty('age');
    });
  });

  describe('Key Validation', () => {
    it('should validate UUID keys', () => {
      const generator = new DynamicKeyGenerator();
      const keys = generator.generateKeys(10, 'UUID');

      const validation = validateGeneratedKeys(keys, 'UUID');
      expect(validation.valid).toBe(true);
      expect(validation.matchRate).toBe(1.0);
      expect(validation.invalidKeys).toHaveLength(0);
    });

    it('should detect invalid keys', () => {
      const keys = ['valid-uuid', 'invalid-key', '12345'];
      const validation = validateGeneratedKeys(keys, 'UUID');

      expect(validation.valid).toBe(false);
      expect(validation.matchRate).toBeLessThan(1.0);
      expect(validation.invalidKeys.length).toBeGreaterThan(0);
    });
  });

  describe('Schema Preprocessing', () => {
    it('should detect dynamic keys annotation', () => {
      const schema = {
        type: 'object',
        'x-dynamic-keys': {
          enabled: true,
          pattern: 'UUID',
        },
      };

      expect(hasDynamicKeys(schema)).toBe(true);
    });

    it('should count dynamic key schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          users: {
            type: 'object',
            'x-dynamic-keys': {
              enabled: true,
              pattern: 'UUID',
            },
          },
          items: {
            type: 'object',
            'x-dynamic-keys': {
              enabled: true,
              pattern: 'NUMERIC_ID',
            },
          },
        },
      };

      expect(countDynamicKeySchemas(schema)).toBe(2);
    });

    it('should expand dynamic keys to static properties', () => {
      const dynamicKeyMetadata: DynamicKeyMetadata = {
        enabled: true,
        pattern: 'UUID',
        confidence: 0.95,
        confidenceLevel: 'high',
        countDistribution: {
          '3': 100,
        },
        countStats: {
          min: 3,
          max: 3,
          median: 3,
          p95: 3,
          total: 100,
          unique: 1,
        },
        documentsAnalyzed: 100,
        uniqueKeysObserved: 300,
        exampleKeys: [
          'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        ],
      };

      const schema = {
        type: 'object',
        'x-dynamic-keys': dynamicKeyMetadata,
        'x-dynamic-key-value-schema': {
          types: ['string'],
          typeProbabilities: [1.0],
          schemas: [{ type: 'string' }],
          isUniformType: true,
          dominantType: 'string',
        },
      };

      const expanded = preprocessSchema(schema, { seed: 42, validateKeys: true });

      expect(expanded.type).toBe('object');
      expect(expanded.properties).toBeDefined();
      expect(Object.keys(expanded.properties)).toHaveLength(3);
      expect(expanded['x-dynamic-keys']).toBeUndefined(); // Annotation removed
    });

    it('should handle nested dynamic keys', () => {
      const schema = {
        type: 'object',
        properties: {
          users: {
            type: 'object',
            'x-dynamic-keys': {
              enabled: true,
              pattern: 'UUID',
              countDistribution: { '2': 100 },
              countStats: {
                min: 2,
                max: 2,
                median: 2,
                p95: 2,
                total: 100,
                unique: 1,
              },
              confidence: 0.95,
              confidenceLevel: 'high',
              documentsAnalyzed: 100,
              uniqueKeysObserved: 200,
              exampleKeys: [],
            },
            'x-dynamic-key-value-schema': {
              types: ['string'],
              typeProbabilities: [1.0],
              schemas: [{ type: 'string' }],
              isUniformType: true,
              dominantType: 'string',
            },
          },
        },
      };

      const expanded = preprocessSchema(schema, { seed: 42 });

      expect(expanded.properties.users.properties).toBeDefined();
      expect(Object.keys(expanded.properties.users.properties)).toHaveLength(2);
    });
  });

  describe('End-to-End Generation', () => {
    it('should generate documents with dynamic keys', async () => {
      const schema = {
        type: 'object',
        properties: {
          staticField: { type: 'string' },
          dynamicData: {
            type: 'object',
            'x-dynamic-keys': {
              enabled: true,
              pattern: 'UUID',
              countDistribution: { '5': 100 },
              countStats: {
                min: 5,
                max: 5,
                median: 5,
                p95: 5,
                total: 100,
                unique: 1,
              },
              confidence: 0.95,
              confidenceLevel: 'high',
              documentsAnalyzed: 100,
              uniqueKeysObserved: 500,
              exampleKeys: [],
            },
            'x-dynamic-key-value-schema': {
              types: ['number'],
              typeProbabilities: [1.0],
              schemas: [{ type: 'number', minimum: 0, maximum: 100 }],
              isUniformType: true,
              dominantType: 'number',
            },
          },
        },
      };

      const doc = await generate(schema, {
        useDynamicKeys: true,
        seed: 42,
      });

      expect(doc).toBeDefined();
      expect(doc.staticField).toBeDefined();
      expect(doc.dynamicData).toBeDefined();
      expect(Object.keys(doc.dynamicData)).toHaveLength(5);

      // Validate keys are UUIDs
      for (const key of Object.keys(doc.dynamicData)) {
        expect(key).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }

      // Validate values are numbers
      for (const value of Object.values(doc.dynamicData)) {
        expect(typeof value).toBe('number');
      }
    });

    it('should be deterministic with seed', async () => {
      const schema = {
        type: 'object',
        properties: {
          dynamicData: {
            type: 'object',
            'x-dynamic-keys': {
              enabled: true,
              pattern: 'UUID',
              countDistribution: { '3': 100 },
              countStats: {
                min: 3,
                max: 3,
                median: 3,
                p95: 3,
                total: 100,
                unique: 1,
              },
              confidence: 0.95,
              confidenceLevel: 'high',
              documentsAnalyzed: 100,
              uniqueKeysObserved: 300,
              exampleKeys: [],
            },
            'x-dynamic-key-value-schema': {
              types: ['string'],
              typeProbabilities: [1.0],
              schemas: [{ type: 'string' }],
              isUniformType: true,
              dominantType: 'string',
            },
          },
        },
      };

      const doc1 = await generate(schema, {
        useDynamicKeys: true,
        seed: 42,
      });

      const doc2 = await generate(schema, {
        useDynamicKeys: true,
        seed: 42,
      });

      expect(doc1).toEqual(doc2);
    });
  });
});
