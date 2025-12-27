/**
 * Unit tests for key pattern detection utilities
 * Feature: 002-dynamic-key-inference
 * Task: T053
 */

import { describe, it, expect } from 'vitest';
import {
  DYNAMIC_KEY_PATTERNS,
  compilePatterns,
  testKeyPattern,
  calculatePatternMatch,
  findBestPattern,
  computeConfidenceScore,
  getConfidenceLevel,
  detectDynamicKeys,
} from '../../src/utils/key-patterns.js';
import { DEFAULT_DYNAMIC_KEY_CONFIG } from '../../src/types/dynamic-keys.js';

describe('Key Pattern Detection Utilities', () => {
  describe('DYNAMIC_KEY_PATTERNS', () => {
    it('should export built-in patterns', () => {
      expect(DYNAMIC_KEY_PATTERNS).toBeDefined();
      expect(DYNAMIC_KEY_PATTERNS.length).toBeGreaterThan(0);

      const patternNames = DYNAMIC_KEY_PATTERNS.map((p) => p.name);
      expect(patternNames).toContain('UUID');
      expect(patternNames).toContain('MONGODB_OBJECTID');
      expect(patternNames).toContain('ULID');
      expect(patternNames).toContain('NUMERIC_ID');
      expect(patternNames).toContain('PREFIXED_ID');
    });

    it('should have valid regex patterns', () => {
      DYNAMIC_KEY_PATTERNS.forEach((pattern) => {
        expect(pattern.regex).toBeInstanceOf(RegExp);
        expect(pattern.name).toBeTruthy();
        expect(pattern.description).toBeTruthy();
      });
    });
  });

  describe('compilePatterns', () => {
    it('should compile patterns from config', () => {
      const patterns = compilePatterns(DEFAULT_DYNAMIC_KEY_CONFIG);
      expect(patterns.length).toBeGreaterThan(0);
      patterns.forEach((pattern) => {
        expect(pattern.regex).toBeInstanceOf(RegExp);
      });
    });

    it('should throw error for invalid regex', () => {
      const badConfig = {
        ...DEFAULT_DYNAMIC_KEY_CONFIG,
        patterns: [{ name: 'BAD', regex: '[invalid(' }],
      };

      expect(() => compilePatterns(badConfig)).toThrow(
        /Invalid regex pattern for BAD/
      );
    });
  });

  describe('testKeyPattern', () => {
    it('should match UUID pattern', () => {
      const uuidPattern = DYNAMIC_KEY_PATTERNS.find((p) => p.name === 'UUID')!;

      expect(testKeyPattern('550e8400-e29b-41d4-a716-446655440000', uuidPattern)).toBe(true);
      expect(testKeyPattern('a0b1c2d3-e4f5-6789-abcd-ef0123456789', uuidPattern)).toBe(true);

      expect(testKeyPattern('not-a-uuid', uuidPattern)).toBe(false);
      expect(testKeyPattern('550e8400e29b41d4a716446655440000', uuidPattern)).toBe(false); // Missing dashes
      expect(testKeyPattern('', uuidPattern)).toBe(false);
    });

    it('should match MongoDB ObjectId pattern', () => {
      const objectIdPattern = DYNAMIC_KEY_PATTERNS.find(
        (p) => p.name === 'MONGODB_OBJECTID'
      )!;

      expect(testKeyPattern('507f1f77bcf86cd799439011', objectIdPattern)).toBe(true);
      expect(testKeyPattern('5f8a7b2c9d3e1f4a6b5c7d8e', objectIdPattern)).toBe(true);

      expect(testKeyPattern('not-an-objectid', objectIdPattern)).toBe(false);
      expect(testKeyPattern('507f1f77bcf86cd799439', objectIdPattern)).toBe(false); // Too short
      expect(testKeyPattern('507f1f77bcf86cd799439011abc', objectIdPattern)).toBe(false); // Too long
    });

    it('should match ULID pattern', () => {
      const ulidPattern = DYNAMIC_KEY_PATTERNS.find((p) => p.name === 'ULID')!;

      expect(testKeyPattern('01ARZ3NDEKTSV4RRFFQ69G5FAV', ulidPattern)).toBe(true);
      expect(testKeyPattern('01F8MECHZX3TBDSZ7XR8MAV654', ulidPattern)).toBe(true);

      expect(testKeyPattern('not-a-ulid', ulidPattern)).toBe(false);
      expect(testKeyPattern('01arz3ndektsv4rrffq69g5fav', ulidPattern)).toBe(false); // Lowercase
    });

    it('should match numeric ID pattern', () => {
      const numericPattern = DYNAMIC_KEY_PATTERNS.find(
        (p) => p.name === 'NUMERIC_ID'
      )!;

      expect(testKeyPattern('123456', numericPattern)).toBe(true);
      expect(testKeyPattern('1234567890', numericPattern)).toBe(true);
      expect(testKeyPattern('12345678901234567890', numericPattern)).toBe(true);

      expect(testKeyPattern('12345', numericPattern)).toBe(false); // Too short
      expect(testKeyPattern('123456789012345678901', numericPattern)).toBe(false); // Too long
      expect(testKeyPattern('abc123', numericPattern)).toBe(false);
    });

    it('should match prefixed ID pattern', () => {
      const prefixedPattern = DYNAMIC_KEY_PATTERNS.find(
        (p) => p.name === 'PREFIXED_ID'
      )!;

      expect(testKeyPattern('user_a1b2c3d4', prefixedPattern)).toBe(true);
      expect(testKeyPattern('doc_12345678', prefixedPattern)).toBe(true);
      expect(testKeyPattern('item_abcdefghijklmnop', prefixedPattern)).toBe(true);
      expect(testKeyPattern('order_z9y8x7w6', prefixedPattern)).toBe(true);

      expect(testKeyPattern('invalid_prefix', prefixedPattern)).toBe(false);
      expect(testKeyPattern('user_abc', prefixedPattern)).toBe(false); // Too short
      expect(testKeyPattern('user', prefixedPattern)).toBe(false); // No suffix
    });
  });

  describe('calculatePatternMatch', () => {
    it('should calculate match ratio for UUID keys', () => {
      const uuidPattern = DYNAMIC_KEY_PATTERNS.find((p) => p.name === 'UUID')!;
      const keys = [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
        'not-a-uuid',
      ];

      const match = calculatePatternMatch(keys, uuidPattern);

      expect(match.pattern).toBe('UUID');
      expect(match.totalKeys).toBe(4);
      expect(match.matchCount).toBe(3);
      expect(match.matchRatio).toBe(0.75);
      expect(match.matchedKeys).toHaveLength(3);
    });

    it('should handle all matching keys', () => {
      const objectIdPattern = DYNAMIC_KEY_PATTERNS.find(
        (p) => p.name === 'MONGODB_OBJECTID'
      )!;
      const keys = [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
      ];

      const match = calculatePatternMatch(keys, objectIdPattern);

      expect(match.matchRatio).toBe(1.0);
      expect(match.matchCount).toBe(3);
      expect(match.totalKeys).toBe(3);
    });

    it('should handle no matching keys', () => {
      const uuidPattern = DYNAMIC_KEY_PATTERNS.find((p) => p.name === 'UUID')!;
      const keys = ['name', 'email', 'address'];

      const match = calculatePatternMatch(keys, uuidPattern);

      expect(match.matchRatio).toBe(0);
      expect(match.matchCount).toBe(0);
      expect(match.totalKeys).toBe(3);
      expect(match.matchedKeys).toHaveLength(0);
    });

    it('should handle empty key array', () => {
      const uuidPattern = DYNAMIC_KEY_PATTERNS.find((p) => p.name === 'UUID')!;
      const keys: string[] = [];

      const match = calculatePatternMatch(keys, uuidPattern);

      expect(match.matchRatio).toBe(0);
      expect(match.matchCount).toBe(0);
      expect(match.totalKeys).toBe(0);
    });
  });

  describe('findBestPattern', () => {
    it('should find best matching pattern among multiple options', () => {
      const keys = [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
      ];

      const bestMatch = findBestPattern(keys, DYNAMIC_KEY_PATTERNS);

      expect(bestMatch).toBeDefined();
      expect(bestMatch?.pattern).toBe('UUID');
      expect(bestMatch?.matchRatio).toBe(1.0);
    });

    it('should return null when all patterns have ratio 0', () => {
      const keys = ['firstName', 'lastName', 'email'];

      const bestMatch = findBestPattern(keys, DYNAMIC_KEY_PATTERNS);

      // When all patterns have 0% match, no pattern is "better" than others
      // so bestMatch remains null
      expect(bestMatch).toBeNull();
    });

    it('should prefer higher match ratio', () => {
      const keys = [
        '507f1f77bcf86cd799439011', // ObjectId
        '507f1f77bcf86cd799439012', // ObjectId
        '507f1f77bcf86cd799439013', // ObjectId
        'user_abc12345', // Prefixed ID
      ];

      const bestMatch = findBestPattern(keys, DYNAMIC_KEY_PATTERNS);

      expect(bestMatch).toBeDefined();
      expect(bestMatch?.pattern).toBe('MONGODB_OBJECTID');
      expect(bestMatch?.matchRatio).toBeGreaterThan(0.5);
    });
  });

  describe('computeConfidenceScore', () => {
    it('should return match ratio as base confidence', () => {
      const confidence = computeConfidenceScore(0.8, 50, 50);
      expect(confidence).toBeCloseTo(0.8, 1);
    });

    it('should boost confidence for high key counts', () => {
      // Key count significantly exceeds threshold
      const baseRatio = 0.8;
      const confidence = computeConfidenceScore(baseRatio, 200, 50);

      expect(confidence).toBeGreaterThan(baseRatio);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should not boost confidence when key count is below 2x threshold', () => {
      const baseRatio = 0.75;
      const confidence = computeConfidenceScore(baseRatio, 60, 50);

      expect(confidence).toBeCloseTo(baseRatio, 2);
    });

    it('should cap confidence at 1.0', () => {
      const confidence = computeConfidenceScore(0.95, 1000, 50);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle perfect match ratio', () => {
      const confidence = computeConfidenceScore(1.0, 100, 50);
      expect(confidence).toBe(1.0);
    });
  });

  describe('getConfidenceLevel', () => {
    it('should return "high" for confidence >= 0.8', () => {
      expect(getConfidenceLevel(0.8)).toBe('high');
      expect(getConfidenceLevel(0.9)).toBe('high');
      expect(getConfidenceLevel(1.0)).toBe('high');
    });

    it('should return "medium" for confidence >= 0.6 and < 0.8', () => {
      expect(getConfidenceLevel(0.6)).toBe('medium');
      expect(getConfidenceLevel(0.7)).toBe('medium');
      expect(getConfidenceLevel(0.79)).toBe('medium');
    });

    it('should return "low" for confidence < 0.6', () => {
      expect(getConfidenceLevel(0.0)).toBe('low');
      expect(getConfidenceLevel(0.3)).toBe('low');
      expect(getConfidenceLevel(0.59)).toBe('low');
    });
  });

  describe('detectDynamicKeys', () => {
    it('should detect UUID pattern with high confidence', () => {
      const keys = Array.from({ length: 60 }, (_, i) =>
        `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
      );

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('UUID');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.confidenceLevel).toBe('high');
      expect(result.totalKeys).toBe(60);
      expect(result.matchCount).toBe(60);
      expect(result.matchRatio).toBe(1.0);
      expect(result.exampleKeys.length).toBeGreaterThan(0);
    });

    it('should detect via pattern-based path even when below count threshold', () => {
      // Pattern-based detection: 100% UUID match, but only 2 keys (below default threshold of 50)
      const keys = [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
      ];

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      // Should detect via pattern-based path (100% match meets minPatternMatch threshold)
      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('UUID');
      expect(result.matchRatio).toBe(1.0);
      expect(result.totalKeys).toBe(2);
      expect(result.confidence).toBeGreaterThan(0.7); // Pattern-based confidence
    });

    it('should detect via count-based path when pattern match is weak but count is high', () => {
      // Count-based detection: 60 keys (meets threshold), but only 66.7% pattern match
      const keys = Array.from({ length: 60 }, (_, i) =>
        i < 40
          ? `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
          : `random_key_${i}`
      );

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      // Should detect via count-based path (60 keys ≥ threshold of 50)
      // Pattern match is 40/60 = 66.7%, below minPatternMatch (0.8), but count path triggers
      expect(result.detected).toBe(true);
      expect(result.matchRatio).toBeCloseTo(0.667, 2);
      expect(result.totalKeys).toBe(60);
      expect(result.pattern).toBe('UUID'); // Best pattern found
      expect(result.confidence).toBeGreaterThan(0.6); // Count-based confidence
    });

    it('should detect MongoDB ObjectId pattern', () => {
      const keys = Array.from({ length: 60 }, (_, i) =>
        `507f1f77bcf86cd7994390${String(i).padStart(2, '0')}`
      );

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('MONGODB_OBJECTID');
      expect(result.confidenceLevel).toBe('high');
    });

    it('should detect numeric ID pattern', () => {
      const keys = Array.from({ length: 60 }, (_, i) =>
        `${100000 + i}`
      );

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('NUMERIC_ID');
    });

    it('should return example keys from matched keys', () => {
      const keys = Array.from({ length: 60 }, (_, i) =>
        `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
      );

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      expect(result.exampleKeys.length).toBeGreaterThan(0);
      expect(result.exampleKeys.length).toBeLessThanOrEqual(10);
      result.exampleKeys.forEach((key) => {
        expect(keys).toContain(key);
      });
    });

    it('should handle mixed static and dynamic keys', () => {
      const keys = [
        ...Array.from({ length: 55 }, (_, i) =>
          `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
        ),
        'metadata',
        'createdAt',
        'updatedAt',
        'userId',
        'status',
      ];

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      // 55/60 = 91.67% match ratio, should pass default 80% threshold
      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('UUID');
      expect(result.matchRatio).toBeCloseTo(0.9167, 2);
    });

    it('should detect regular object keys via count-based path if count is high', () => {
      // Count-based detection: 60 generic field names (no pattern match)
      const keys = Array.from({ length: 60 }, (_, i) => `field${i}`);

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      // Should detect via count-based path (60 ≥ threshold of 50)
      expect(result.detected).toBe(true);
      expect(result.pattern).toBe(null); // No pattern matched
      expect(result.customPattern).toBeUndefined();
      expect(result.matchRatio).toBe(0); // No pattern match
      expect(result.confidence).toBeGreaterThan(0.6); // Count-based confidence
    });

    it('should not detect when both count and pattern thresholds fail', () => {
      // Low count (below threshold) AND weak pattern match (below minPatternMatch)
      const keys = [
        '550e8400-e29b-41d4-a716-446655440001', // UUID
        'not-a-uuid',
        'another-regular-key',
      ];

      const result = detectDynamicKeys(keys, DEFAULT_DYNAMIC_KEY_CONFIG);

      // Should NOT detect: only 3 keys (< 50 threshold) AND 33% pattern match (< 80% minPatternMatch)
      expect(result.detected).toBe(false);
      expect(result.totalKeys).toBe(3);
      expect(result.matchRatio).toBeCloseTo(0.333, 2);
    });

    it('should respect custom threshold', () => {
      const keys = Array.from({ length: 30 }, (_, i) =>
        `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
      );

      const customConfig = {
        ...DEFAULT_DYNAMIC_KEY_CONFIG,
        threshold: 25,
      };

      const result = detectDynamicKeys(keys, customConfig);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('UUID');
    });

    it('should respect custom minPatternMatch', () => {
      const keys = [
        ...Array.from({ length: 35 }, (_, i) =>
          `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`
        ),
        ...Array.from({ length: 25 }, (_, i) => `regular_key_${i}`),
      ];

      const customConfig = {
        ...DEFAULT_DYNAMIC_KEY_CONFIG,
        minPatternMatch: 0.5, // Lower pattern match threshold
        confidenceThreshold: 0.5, // Lower confidence threshold
      };

      const result = detectDynamicKeys(keys, customConfig);

      // 35/60 = 58.33% match, passes both 50% thresholds
      expect(result.detected).toBe(true);
      expect(result.pattern).toBe('UUID');
    });
  });
});
