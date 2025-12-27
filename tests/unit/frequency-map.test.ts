/**
 * Unit tests for frequency distribution utilities
 * Feature: 002-dynamic-key-inference
 * Task: T052
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFrequencies,
  sampleFromDistribution,
  getPercentile,
  calculateDistributionStats,
} from '../../src/utils/frequency-map.js';

describe('Frequency Map Utilities', () => {
  describe('calculateFrequencies', () => {
    it('should calculate frequency distribution from array of numbers', () => {
      const values = [1, 2, 2, 3, 3, 3];
      const result = calculateFrequencies(values);

      expect(result).toEqual({
        '1': 1,
        '2': 2,
        '3': 3,
      });
    });

    it('should handle empty array', () => {
      const values: number[] = [];
      const result = calculateFrequencies(values);

      expect(result).toEqual({});
    });

    it('should handle single value', () => {
      const values = [5];
      const result = calculateFrequencies(values);

      expect(result).toEqual({
        '5': 1,
      });
    });

    it('should handle all same values', () => {
      const values = [7, 7, 7, 7, 7];
      const result = calculateFrequencies(values);

      expect(result).toEqual({
        '7': 5,
      });
    });

    it('should handle large numbers', () => {
      const values = [100, 200, 100, 300];
      const result = calculateFrequencies(values);

      expect(result).toEqual({
        '100': 2,
        '200': 1,
        '300': 1,
      });
    });

    it('should handle zero values', () => {
      const values = [0, 0, 1, 0];
      const result = calculateFrequencies(values);

      expect(result).toEqual({
        '0': 3,
        '1': 1,
      });
    });

    it('should handle negative numbers', () => {
      const values = [-1, -1, 0, 1, 1, 1];
      const result = calculateFrequencies(values);

      expect(result).toEqual({
        '-1': 2,
        '0': 1,
        '1': 3,
      });
    });
  });

  describe('sampleFromDistribution', () => {
    it('should sample value from distribution', () => {
      const distribution = {
        '1': 50,
        '2': 30,
        '3': 20,
      };

      // Sample multiple times to test weighted selection
      // Increased from 100 to 1000 for more stable probabilistic testing
      const samples: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const sample = sampleFromDistribution(distribution);
        samples.push(sample);
        expect(["1", "2", "3"]).toContain(sample);
      }

      // Verify all values were sampled at least once (probabilistic test)
      const uniqueSamples = new Set(samples);
      expect(uniqueSamples.size).toBe(3);

      // Verify distribution is roughly correct (1 should appear most, 3 least)
      // Using >= to handle edge cases while still validating distribution
      const sampledFreqs = calculateFrequencies(samples);
      const freq1 = parseInt(sampledFreqs['1'] || '0', 10);
      const freq2 = parseInt(sampledFreqs['2'] || '0', 10);
      const freq3 = parseInt(sampledFreqs['3'] || '0', 10);

      expect(freq1).toBeGreaterThanOrEqual(freq2);
      expect(freq2).toBeGreaterThanOrEqual(freq3);
    });

    it('should always return same value for single-value distribution', () => {
      const distribution = { '42': 100 };

      for (let i = 0; i < 10; i++) {
        const sample = sampleFromDistribution(distribution);
        expect(sample).toBe("42");
      }
    });

    it('should throw error for empty distribution', () => {
      const distribution = {};
      expect(() => sampleFromDistribution(distribution)).toThrow(
        'Cannot sample from empty distribution'
      );
    });

    it('should handle distribution with zero-frequency edge case', () => {
      // Note: This shouldn't happen in practice, but test defensive behavior
      const distribution = {
        '1': 0,
        '2': 100,
      };

      const sample = sampleFromDistribution(distribution);
      expect(sample).toBe("2");
    });
  });

  describe('getPercentile', () => {
    it('should calculate median (50th percentile)', () => {
      const distribution = {
        '1': 25,
        '2': 50,
        '3': 25,
      };

      const median = getPercentile(distribution, 0.5);
      expect(median).toBe(2);
    });

    it('should calculate 25th percentile', () => {
      const distribution = {
        '1': 25,
        '2': 25,
        '3': 25,
        '4': 25,
      };

      const p25 = getPercentile(distribution, 0.25);
      expect(p25).toBeLessThanOrEqual(2);
    });

    it('should calculate 95th percentile', () => {
      const distribution = {
        '1': 50,
        '2': 30,
        '5': 15,
        '10': 5,
      };

      const p95 = getPercentile(distribution, 0.95);
      // 95% of 100 items = 95 items
      // Items 1-50: value 1, items 51-80: value 2, items 81-95: value 5, items 96-100: value 10
      // 95th item falls in value 5
      expect(p95).toBe(5);
    });

    it('should return min for 0th percentile', () => {
      const distribution = {
        '1': 10,
        '5': 20,
        '10': 30,
      };

      const p0 = getPercentile(distribution, 0.0);
      expect(p0).toBe(1);
    });

    it('should return max for 100th percentile', () => {
      const distribution = {
        '1': 10,
        '5': 20,
        '10': 30,
      };

      const p100 = getPercentile(distribution, 1.0);
      expect(p100).toBe(10);
    });

    it('should throw error for percentile < 0', () => {
      const distribution = { '1': 100 };
      expect(() => getPercentile(distribution, -0.1)).toThrow(
        'Percentile must be between 0.0 and 1.0'
      );
    });

    it('should throw error for percentile > 1', () => {
      const distribution = { '1': 100 };
      expect(() => getPercentile(distribution, 1.1)).toThrow(
        'Percentile must be between 0.0 and 1.0'
      );
    });

    it('should throw error for empty distribution', () => {
      const distribution = {};
      expect(() => getPercentile(distribution, 0.5)).toThrow(
        'Cannot calculate percentile of empty distribution'
      );
    });

    it('should handle single-value distribution', () => {
      const distribution = { '42': 100 };
      const p50 = getPercentile(distribution, 0.5);
      expect(p50).toBe(42);
    });

    it('should handle skewed distribution', () => {
      const distribution = {
        '1': 95,
        '100': 5,
      };

      const p50 = getPercentile(distribution, 0.5);
      expect(p50).toBe(1); // Most values are 1

      const p99 = getPercentile(distribution, 0.99);
      expect(p99).toBe(100); // Top 1% are 100
    });
  });

  describe('calculateDistributionStats', () => {
    it('should calculate comprehensive stats', () => {
      const distribution = {
        '1': 450,
        '2': 350,
        '3': 150,
        '4': 40,
        '5': 10,
      };

      const stats = calculateDistributionStats(distribution);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.total).toBe(1000);
      expect(stats.unique).toBe(5);
      expect(stats.median).toBe(2);
      expect(stats.p95).toBeGreaterThanOrEqual(3);
    });

    it('should handle single-value distribution', () => {
      const distribution = { '42': 100 };

      const stats = calculateDistributionStats(distribution);

      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.median).toBe(42);
      expect(stats.p95).toBe(42);
      expect(stats.total).toBe(100);
      expect(stats.unique).toBe(1);
    });

    it('should handle two-value distribution', () => {
      const distribution = {
        '1': 80,
        '10': 20,
      };

      const stats = calculateDistributionStats(distribution);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.median).toBe(1); // 50th percentile falls in first value
      expect(stats.p95).toBe(10);
      expect(stats.total).toBe(100);
      expect(stats.unique).toBe(2);
    });

    it('should throw error for empty distribution', () => {
      const distribution = {};
      expect(() => calculateDistributionStats(distribution)).toThrow(
        'Cannot calculate stats for empty distribution'
      );
    });

    it('should handle uniform distribution', () => {
      const distribution = {
        '1': 25,
        '2': 25,
        '3': 25,
        '4': 25,
      };

      const stats = calculateDistributionStats(distribution);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(4);
      expect(stats.median).toBeGreaterThanOrEqual(2);
      expect(stats.median).toBeLessThanOrEqual(3);
      expect(stats.total).toBe(100);
      expect(stats.unique).toBe(4);
    });

    it('should handle large value ranges', () => {
      const distribution = {
        '1': 50,
        '100': 30,
        '1000': 20,
      };

      const stats = calculateDistributionStats(distribution);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(1000);
      expect(stats.total).toBe(100);
      expect(stats.unique).toBe(3);
      expect(stats.median).toBeLessThanOrEqual(100);
      expect(stats.p95).toBe(1000);
    });

    it('should handle realistic array length distribution', () => {
      // Simulates typical array length distribution from real data
      const distribution = {
        '0': 10,
        '1': 150,
        '2': 300,
        '3': 250,
        '4': 150,
        '5': 100,
        '10': 30,
        '20': 10,
      };

      const stats = calculateDistributionStats(distribution);

      expect(stats.min).toBe(0);
      expect(stats.max).toBe(20);
      expect(stats.total).toBe(1000);
      expect(stats.unique).toBe(8);
      expect(stats.median).toBeGreaterThanOrEqual(2);
      expect(stats.median).toBeLessThanOrEqual(3);
      // 95% of 1000 = 950 items
      // 0-10: 10, 10-160: 1, 160-460: 2, 460-710: 3, 710-860: 4, 860-960: 5
      // 950th item falls in value 5
      expect(stats.p95).toBeGreaterThanOrEqual(5);
      expect(stats.p95).toBeLessThanOrEqual(10);
    });
  });

  describe('Integration: Calculate → Sample → Stats', () => {
    it('should work correctly in a complete workflow', () => {
      // Step 1: Calculate frequencies from raw data
      const rawLengths = [1, 2, 2, 3, 3, 3, 4, 4, 5];
      const distribution = calculateFrequencies(rawLengths);

      expect(distribution).toEqual({
        '1': 1,
        '2': 2,
        '3': 3,
        '4': 2,
        '5': 1,
      });

      // Step 2: Calculate stats
      const stats = calculateDistributionStats(distribution);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.median).toBe(3);
      expect(stats.total).toBe(9);
      expect(stats.unique).toBe(5);

      // Step 3: Sample from distribution
      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const sample = Number(sampleFromDistribution(distribution));
        samples.push(sample);
        expect(sample).toBeGreaterThanOrEqual(1);
        expect(sample).toBeLessThanOrEqual(5);
      }

      // Verify sampling respects distribution
      const sampledDist = calculateFrequencies(samples);
      const sampledStats = calculateDistributionStats(sampledDist);

      expect(sampledStats.min).toBe(1);
      expect(sampledStats.max).toBe(5);
      expect(sampledStats.median).toBe(3); // Should match original median
    });
  });
});
