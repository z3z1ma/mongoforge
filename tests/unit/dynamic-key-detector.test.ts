/**
 * Unit tests for dynamic key detector
 * Feature: 002-dynamic-key-inference
 * Task: T054
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeObjectKeys,
  countUniqueKeys,
  analyzeValueTypes,
  buildDynamicKeyMetadata,
} from '../../src/lib/inferencer/dynamic-key-detector.js';
import { DEFAULT_DYNAMIC_KEY_CONFIG } from '../../src/types/dynamic-keys.js';
import type { DynamicKeyDetectionConfig } from '../../src/types/dynamic-keys.js';

describe('Dynamic Key Detector', () => {
  describe('countUniqueKeys', () => {
    it('should count unique keys across documents', () => {
      const documents = [
        { data: { key1: 1, key2: 2 } },
        { data: { key2: 2, key3: 3 } },
        { data: { key1: 1, key3: 3, key4: 4 } },
      ];

      const uniqueKeys = countUniqueKeys(documents, 'data');

      expect(uniqueKeys.size).toBe(4);
      expect(uniqueKeys.has('key1')).toBe(true);
      expect(uniqueKeys.has('key2')).toBe(true);
      expect(uniqueKeys.has('key3')).toBe(true);
      expect(uniqueKeys.has('key4')).toBe(true);
    });

    it('should handle empty documents array', () => {
      const documents: any[] = [];
      const uniqueKeys = countUniqueKeys(documents, 'data');

      expect(uniqueKeys.size).toBe(0);
    });

    it('should handle documents with missing field', () => {
      const documents = [
        { data: { key1: 1 } },
        { other: { key2: 2 } }, // Missing 'data' field
        { data: { key3: 3 } },
      ];

      const uniqueKeys = countUniqueKeys(documents, 'data');

      expect(uniqueKeys.size).toBe(2);
      expect(uniqueKeys.has('key1')).toBe(true);
      expect(uniqueKeys.has('key3')).toBe(true);
    });

    it('should handle nested field paths', () => {
      const documents = [
        { user: { profile: { setting1: 'a' } } },
        { user: { profile: { setting2: 'b' } } },
        { user: { profile: { setting1: 'c', setting3: 'd' } } },
      ];

      const uniqueKeys = countUniqueKeys(documents, 'user.profile');

      expect(uniqueKeys.size).toBe(3);
      expect(uniqueKeys.has('setting1')).toBe(true);
      expect(uniqueKeys.has('setting2')).toBe(true);
      expect(uniqueKeys.has('setting3')).toBe(true);
    });

    it('should ignore non-object values', () => {
      const documents = [
        { data: { key1: 1 } },
        { data: 'not an object' },
        { data: null },
        { data: [1, 2, 3] }, // Array
        { data: { key2: 2 } },
      ];

      const uniqueKeys = countUniqueKeys(documents, 'data');

      expect(uniqueKeys.size).toBe(2);
      expect(uniqueKeys.has('key1')).toBe(true);
      expect(uniqueKeys.has('key2')).toBe(true);
    });
  });

  describe('analyzeValueTypes', () => {
    it('should analyze uniform type (all strings)', () => {
      const documents = [
        { data: { key1: 'value1', key2: 'value2' } },
        { data: { key3: 'value3', key4: 'value4' } },
      ];

      const keys = new Set(['key1', 'key2', 'key3', 'key4']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      expect(valueSchema.isUniformType).toBe(true);
      expect(valueSchema.dominantType).toBe('string');
      expect(valueSchema.types).toEqual(['string']);
      expect(valueSchema.typeProbabilities).toEqual([1.0]);
      expect(valueSchema.schemas).toHaveLength(1);
      expect(valueSchema.schemas[0].type).toBe('string');
    });

    it('should analyze uniform type (all numbers)', () => {
      const documents = [
        { data: { key1: 100, key2: 200 } },
        { data: { key3: 300, key4: 400 } },
      ];

      const keys = new Set(['key1', 'key2', 'key3', 'key4']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      expect(valueSchema.isUniformType).toBe(true);
      expect(valueSchema.dominantType).toBe('integer');
      expect(valueSchema.types).toEqual(['integer']);
    });

    it('should analyze mixed value types', () => {
      const documents = [
        { data: { key1: 'string', key2: 100 } },
        { data: { key3: 'another', key4: true } },
        { data: { key5: 'more', key6: 200 } },
      ];

      const keys = new Set(['key1', 'key2', 'key3', 'key4', 'key5', 'key6']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      expect(valueSchema.isUniformType).toBe(false);
      expect(valueSchema.types.length).toBeGreaterThan(1);
      expect(valueSchema.types).toContain('string');
      expect(valueSchema.types).toContain('integer');

      // Probabilities should sum to 1.0
      const sum = valueSchema.typeProbabilities.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should calculate type probabilities correctly', () => {
      const documents = [
        { data: { k1: 1, k2: 2, k3: 3 } }, // 3 integers
        { data: { k4: 'a', k5: 'b' } }, // 2 strings
      ];

      const keys = new Set(['k1', 'k2', 'k3', 'k4', 'k5']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      // Should have integer as dominant (3/5 = 0.6)
      expect(valueSchema.dominantType).toBe('integer');

      const integerIndex = valueSchema.types.indexOf('integer');
      const stringIndex = valueSchema.types.indexOf('string');

      expect(valueSchema.typeProbabilities[integerIndex]).toBeCloseTo(0.6, 2);
      expect(valueSchema.typeProbabilities[stringIndex]).toBeCloseTo(0.4, 2);
    });

    it('should handle null values', () => {
      const documents = [
        { data: { key1: null, key2: 'value' } },
        { data: { key3: null } },
      ];

      const keys = new Set(['key1', 'key2', 'key3']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      expect(valueSchema.types).toContain('null');
      expect(valueSchema.types).toContain('string');
    });

    it('should handle array values', () => {
      const documents = [
        { data: { key1: [1, 2, 3], key2: 'value' } },
      ];

      const keys = new Set(['key1', 'key2']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      expect(valueSchema.types).toContain('array');
      expect(valueSchema.types).toContain('string');
    });

    it('should handle object values', () => {
      const documents = [
        { data: { key1: { nested: 'value' }, key2: 123 } },
      ];

      const keys = new Set(['key1', 'key2']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      expect(valueSchema.types).toContain('object');
      expect(valueSchema.types).toContain('integer');
    });

    it('should handle empty key set', () => {
      const documents = [
        { data: { key1: 'value' } },
      ];

      const keys = new Set<string>();
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      expect(valueSchema.types).toEqual([]);
      expect(valueSchema.typeProbabilities).toEqual([]);
      expect(valueSchema.schemas).toEqual([]);
    });

    it('should sort types by frequency (descending)', () => {
      const documents = [
        { data: { k1: 'a', k2: 'b', k3: 'c', k4: 'd', k5: 'e' } }, // 5 strings
        { data: { k6: 1, k7: 2 } }, // 2 integers
        { data: { k8: true } }, // 1 boolean
      ];

      const keys = new Set(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']);
      const valueSchema = analyzeValueTypes(documents, 'data', keys);

      // Most common first
      expect(valueSchema.types[0]).toBe('string');
      expect(valueSchema.types[1]).toBe('integer');
      expect(valueSchema.types[2]).toBe('boolean');

      // Probabilities should be descending
      expect(valueSchema.typeProbabilities[0]).toBeGreaterThan(valueSchema.typeProbabilities[1]);
      expect(valueSchema.typeProbabilities[1]).toBeGreaterThan(valueSchema.typeProbabilities[2]);
    });
  });

  describe('buildDynamicKeyMetadata', () => {
    it('should build complete metadata from detection result', () => {
      const detection = {
        detected: true,
        pattern: 'UUID' as const,
        confidence: 0.95,
        confidenceLevel: 'high' as const,
        totalKeys: 60,
        matchCount: 60,
        matchRatio: 1.0,
        exampleKeys: ['550e8400-e29b-41d4-a716-446655440001'],
      };

      const keyCounts = [10, 12, 11, 10, 13];
      const documentsAnalyzed = 5;
      const valueSchema = {
        types: ['string'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'string' }],
        isUniformType: true,
        dominantType: 'string',
      };

      const metadata = buildDynamicKeyMetadata(
        detection,
        keyCounts,
        documentsAnalyzed,
        valueSchema
      );

      expect(metadata.enabled).toBe(true);
      expect(metadata.pattern).toBe('UUID');
      expect(metadata.confidence).toBe(0.95);
      expect(metadata.confidenceLevel).toBe('high');
      expect(metadata.documentsAnalyzed).toBe(5);
      expect(metadata.uniqueKeysObserved).toBe(60);
      expect(metadata.exampleKeys).toHaveLength(1);
      expect(metadata.countDistribution).toBeDefined();
      expect(metadata.countStats).toBeDefined();
      expect(metadata.countStats.min).toBe(10);
      expect(metadata.countStats.max).toBe(13);
    });

    it('should handle custom pattern', () => {
      const detection = {
        detected: true,
        pattern: 'CUSTOM' as const,
        customPattern: '^custom_[a-z]+$',
        confidence: 0.85,
        confidenceLevel: 'high' as const,
        totalKeys: 100,
        matchCount: 90,
        matchRatio: 0.9,
        exampleKeys: ['custom_abc', 'custom_def'],
      };

      const keyCounts = [20, 22, 21];
      const valueSchema = {
        types: ['number'],
        typeProbabilities: [1.0],
        schemas: [{ type: 'number' }],
        isUniformType: true,
        dominantType: 'number',
      };

      const metadata = buildDynamicKeyMetadata(
        detection,
        keyCounts,
        3,
        valueSchema
      );

      expect(metadata.pattern).toBe('CUSTOM');
      expect(metadata.customPattern).toBe('^custom_[a-z]+$');
      expect(metadata.confidence).toBe(0.85);
    });
  });

  describe('analyzeObjectKeys', () => {
    const lowThresholdConfig: DynamicKeyDetectionConfig = {
      ...DEFAULT_DYNAMIC_KEY_CONFIG,
      threshold: 5,
      minPatternMatch: 0.8,
      confidenceThreshold: 0.7,
    };

    it('should detect UUID pattern when threshold exceeded', () => {
      const documents = Array.from({ length: 3 }, (_, docIdx) => ({
        data: Object.fromEntries(
          Array.from({ length: 10 }, (_, keyIdx) => [
            `550e8400-e29b-41d4-a716-4466554400${String(docIdx * 10 + keyIdx).padStart(2, '0')}`,
            `value${keyIdx}`,
          ])
        ),
      }));

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      expect(analysis.isDynamic).toBe(true);
      expect(analysis.fieldPath).toBe('data');
      expect(analysis.uniqueKeys.size).toBe(30);
      expect(analysis.detection?.pattern).toBe('UUID');
      expect(analysis.detection?.confidence).toBeGreaterThan(0.7);
      expect(analysis.metadata).toBeDefined();
      expect(analysis.metadata?.enabled).toBe(true);
      expect(analysis.valueSchema).toBeDefined();
    });

    it('should not detect when below threshold', () => {
      const documents = [
        { data: { key1: 'a', key2: 'b', key3: 'c' } },
      ];

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      expect(analysis.isDynamic).toBe(false);
      expect(analysis.uniqueKeys.size).toBe(3);
    });

    it('should detect MongoDB ObjectId pattern', () => {
      const documents = Array.from({ length: 2 }, (_, docIdx) => ({
        data: Object.fromEntries(
          Array.from({ length: 10 }, (_, keyIdx) => [
            `507f1f77bcf86cd7994390${String(docIdx * 10 + keyIdx).padStart(2, '0')}`,
            keyIdx,
          ])
        ),
      }));

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      expect(analysis.isDynamic).toBe(true);
      expect(analysis.detection?.pattern).toBe('MONGODB_OBJECTID');
    });

    it('should respect forceStaticPaths override', () => {
      const documents = Array.from({ length: 3 }, (_, docIdx) => ({
        metadata: Object.fromEntries(
          Array.from({ length: 20 }, (_, keyIdx) => [
            `550e8400-e29b-41d4-a716-4466554400${String(docIdx * 20 + keyIdx).padStart(2, '0')}`,
            `value${keyIdx}`,
          ])
        ),
      }));

      const configWithOverride = {
        ...lowThresholdConfig,
        forceStaticPaths: ['metadata'],
      };

      const analysis = analyzeObjectKeys(documents, 'metadata', configWithOverride);

      expect(analysis.isDynamic).toBe(false);
      expect(analysis.uniqueKeys.size).toBe(0);
    });

    it('should respect forceDynamicPaths override', () => {
      const documents = [
        { custom: { key1: 1, key2: 2, key3: 3 } },
        { custom: { key4: 4, key5: 5, key6: 6 } },
      ];

      const configWithOverride = {
        ...lowThresholdConfig,
        threshold: 100, // Very high threshold
        forceDynamicPaths: ['custom'],
      };

      const analysis = analyzeObjectKeys(documents, 'custom', configWithOverride);

      expect(analysis.isDynamic).toBe(true);
      expect(analysis.detection?.pattern).toBe('CUSTOM');
      expect(analysis.detection?.confidence).toBe(1.0);
      expect(analysis.metadata?.enabled).toBe(true);
    });

    it('should handle mixed static and dynamic keys', () => {
      const documents = [
        {
          data: {
            ...Object.fromEntries(
              Array.from({ length: 8 }, (_, i) => [
                `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
                i,
              ])
            ),
            createdAt: '2024-01-01',
            updatedAt: '2024-01-02',
          },
        },
      ];

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      // 8 UUID keys + 2 static keys = 10 total
      // 8/10 = 80% match ratio, should pass 0.8 threshold
      expect(analysis.uniqueKeys.size).toBe(10);
      expect(analysis.isDynamic).toBe(true);
      expect(analysis.detection?.pattern).toBe('UUID');
    });

    it('should handle exactly threshold number of keys with pattern match', () => {
      const documents = [
        {
          data: Object.fromEntries(
            Array.from({ length: 5 }, (_, i) => [
              `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
              i,
            ])
          ),
        },
      ];

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      // Exactly at threshold (5), with pattern match -> should detect
      expect(analysis.uniqueKeys.size).toBe(5);
      expect(analysis.isDynamic).toBe(true);
    });

    it('should detect via count-based path even when pattern match ratio is low', () => {
      const documents = [
        {
          data: {
            ...Object.fromEntries(
              Array.from({ length: 3 }, (_, i) => [
                `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
                i,
              ])
            ),
            ...Object.fromEntries(
              Array.from({ length: 7 }, (_, i) => [`regularKey${i}`, i])
            ),
          },
        },
      ];

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      // 10 keys meets count threshold (5), even though pattern match is only 3/10 = 30% (below 0.8)
      expect(analysis.uniqueKeys.size).toBe(10);
      expect(analysis.isDynamic).toBe(true); // Detected via count-based path
      expect(analysis.detection?.pattern).toBe('UUID'); // Best pattern found
      expect(analysis.detection?.matchRatio).toBeCloseTo(0.3, 1);
      expect(analysis.detection?.confidence).toBeGreaterThanOrEqual(0.7); // Count-based confidence
    });

    it('should handle nested field paths', () => {
      const documents = Array.from({ length: 2 }, (_, docIdx) => ({
        user: {
          preferences: Object.fromEntries(
            Array.from({ length: 10 }, (_, keyIdx) => [
              `550e8400-e29b-41d4-a716-4466554400${String(docIdx * 10 + keyIdx).padStart(2, '0')}`,
              true,
            ])
          ),
        },
      }));

      const analysis = analyzeObjectKeys(documents, 'user.preferences', lowThresholdConfig);

      expect(analysis.isDynamic).toBe(true);
      expect(analysis.fieldPath).toBe('user.preferences');
      expect(analysis.detection?.pattern).toBe('UUID');
    });

    it('should include value schema in analysis', () => {
      const documents = [
        {
          data: Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [
              `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
              `string_value_${i}`,
            ])
          ),
        },
      ];

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      expect(analysis.valueSchema).toBeDefined();
      expect(analysis.valueSchema?.isUniformType).toBe(true);
      expect(analysis.valueSchema?.dominantType).toBe('string');
      expect(analysis.valueSchema?.types).toEqual(['string']);
    });

    it('should include key count distribution in metadata', () => {
      // Generate documents with varying key counts that share all keys
      const allKeys = Array.from({ length: 30 }, (_, i) =>
        `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
      );

      const documents = [
        { data: Object.fromEntries(allKeys.slice(0, 8).map((k, i) => [k, i])) },
        { data: Object.fromEntries(allKeys.slice(0, 12).map((k, i) => [k, i])) },
        { data: Object.fromEntries(allKeys.slice(0, 10).map((k, i) => [k, i])) },
      ];

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      expect(analysis.isDynamic).toBe(true);
      expect(analysis.metadata).toBeDefined();
      expect(analysis.metadata?.countDistribution).toBeDefined();
      expect(analysis.metadata?.countDistribution['8']).toBe(1);
      expect(analysis.metadata?.countDistribution['12']).toBe(1);
      expect(analysis.metadata?.countDistribution['10']).toBe(1);
      expect(analysis.metadata?.countStats.min).toBe(8);
      expect(analysis.metadata?.countStats.max).toBe(12);
    });

    it('should handle numeric ID pattern', () => {
      const documents = [
        {
          data: Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [String(100000 + i), `value${i}`])
          ),
        },
      ];

      const analysis = analyzeObjectKeys(documents, 'data', lowThresholdConfig);

      expect(analysis.isDynamic).toBe(true);
      expect(analysis.detection?.pattern).toBe('NUMERIC_ID');
    });

    it('should match path patterns with wildcards', () => {
      const documents = [
        {
          users: {
            profile: Object.fromEntries(
              Array.from({ length: 10 }, (_, i) => [
                `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
                i,
              ])
            ),
          },
        },
      ];

      const configWithWildcard = {
        ...lowThresholdConfig,
        forceStaticPaths: ['users.*'],
      };

      const analysis = analyzeObjectKeys(documents, 'users.profile', configWithWildcard);

      expect(analysis.isDynamic).toBe(false);
    });
  });
});
