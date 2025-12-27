/**
 * Unit tests for vendor keyword utilities
 */

import { describe, it, expect } from 'vitest';
import { 
  applyArrayLenExtension, 
  getRecommendedArrayLength 
} from '../../src/lib/synthesizer/vendor-keywords.js';
import { ArrayLengthStats } from '../../src/types/dynamic-keys.js';
import { XGenArrayLen } from '../../src/types/data-model.js';

describe('Vendor Keywords', () => {
  describe('applyArrayLenExtension', () => {
    it('should include distribution in x-gen.arrayLen', () => {
      const arrayStats: ArrayLengthStats = {
        fieldPath: 'tags',
        distribution: { '1': 10, '2': 20, '5': 5 },
        stats: {
          min: 1,
          max: 5,
          median: 2,
          p95: 5,
          total: 35,
          unique: 3
        }
      };

      const extensions = applyArrayLenExtension('tags', arrayStats);
      expect(extensions.arrayLen).toBeDefined();
      expect(extensions.arrayLen?.distribution).toEqual(arrayStats.distribution);
      expect(extensions.arrayLen?.min).toBe(1);
      expect(extensions.arrayLen?.max).toBe(5);
    });
  });

  describe('getRecommendedArrayLength', () => {
    it('should use frequency distribution for weighted sampling', () => {
      const arrayLen: XGenArrayLen = {
        min: 1,
        max: 10,
        p50: 5,
        p90: 8,
        p99: 10,
        strategy: 'percentile',
        distribution: {
          '1': 10, // 0 - 10
          '5': 10, // 10 - 20
          '10': 80 // 20 - 100
        }
      };

      // 10% chance for 1
      expect(getRecommendedArrayLength(arrayLen, 0.05)).toBe(1);
      // another 10% chance for 5
      expect(getRecommendedArrayLength(arrayLen, 0.15)).toBe(5);
      // 80% chance for 10
      expect(getRecommendedArrayLength(arrayLen, 0.5)).toBe(10);
      expect(getRecommendedArrayLength(arrayLen, 0.99)).toBe(10);
    });

    it('should fallback to old logic if distribution is missing', () => {
      const arrayLen: XGenArrayLen = {
        min: 1,
        max: 10,
        p50: 5,
        p90: 8,
        p99: 10,
        strategy: 'minmax'
      };

      const len = getRecommendedArrayLength(arrayLen, 0.5);
      expect(len).toBeGreaterThanOrEqual(1);
      expect(len).toBeLessThanOrEqual(10);
    });
  });
});
