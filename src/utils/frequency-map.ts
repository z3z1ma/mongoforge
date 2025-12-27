/**
 * Frequency distribution utilities for dynamic keys and array length statistics
 * Feature: 002-dynamic-key-inference
 */

import type {
  FrequencyDistribution,
  DistributionStats,
} from "../types/dynamic-keys.js";

/**
 * Calculate frequency distribution from an array of values
 *
 * @param values - Array of numeric values to analyze
 * @returns Frequency distribution mapping stringified values to counts
 *
 * @example
 * calculateFrequencies([1, 2, 2, 3, 3, 3])
 * // Returns: { "1": 1, "2": 2, "3": 3 }
 */
export function calculateFrequencies(values: number[]): FrequencyDistribution {
  const distribution: FrequencyDistribution = {};

  for (const value of values) {
    const key = String(value);
    distribution[key] = (distribution[key] || 0) + 1;
  }

  return distribution;
}

/**
 * Sample a value from a frequency distribution
 * Uses weighted random selection based on frequencies
 *
 * @param distribution - Frequency distribution to sample from
 * @returns Sampled numeric value
 *
 * @example
 * sampleFromDistribution({ "1": 50, "2": 30, "3": 20 })
 * // Returns: 1, 2, or 3 (weighted by frequency)
 */
export function sampleFromDistribution(
  distribution: FrequencyDistribution,
): number {
  const entries = Object.entries(distribution);

  if (entries.length === 0) {
    throw new Error("Cannot sample from empty distribution");
  }

  // Calculate total frequency
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  // Generate random number between 0 and total
  const random = Math.random() * total;

  // Find the value corresponding to this random number
  let cumulative = 0;
  for (const [value, count] of entries) {
    cumulative += count;
    if (random < cumulative) {
      return Number(value);
    }
  }

  // Fallback to last value (should never reach here due to floating point precision)
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry) {
    throw new Error("Distribution has no entries");
  }
  return Number(lastEntry[0]);
}

/**
 * Calculate a specific percentile from a frequency distribution
 *
 * @param distribution - Frequency distribution
 * @param percentile - Percentile to calculate (0.0 - 1.0)
 * @returns Value at the specified percentile
 *
 * @example
 * getPercentile({ "1": 50, "2": 30, "5": 20 }, 0.5)
 * // Returns: 2 (median)
 */
export function getPercentile(
  distribution: FrequencyDistribution,
  percentile: number,
): number {
  if (percentile < 0 || percentile > 1) {
    throw new Error("Percentile must be between 0.0 and 1.0");
  }

  const entries = Object.entries(distribution)
    .map(([value, count]) => ({ value: Number(value), count }))
    .sort((a, b) => a.value - b.value);

  if (entries.length === 0) {
    throw new Error("Cannot calculate percentile of empty distribution");
  }

  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const targetCount = total * percentile;

  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.count;
    if (cumulative >= targetCount) {
      return entry.value;
    }
  }

  // Fallback to maximum value
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry) {
    throw new Error("Distribution has no entries");
  }
  return lastEntry.value;
}

/**
 * Calculate comprehensive distribution statistics
 *
 * @param distribution - Frequency distribution
 * @returns Statistical summary including min, max, median, p95, total, and unique
 *
 * @example
 * calculateDistributionStats({ "1": 450, "2": 350, "3": 150 })
 * // Returns: { min: 1, max: 3, median: 2, p95: 3, total: 950, unique: 3 }
 */
export function calculateDistributionStats(
  distribution: FrequencyDistribution,
): DistributionStats {
  const entries = Object.entries(distribution)
    .map(([value, count]) => ({ value: Number(value), count }))
    .sort((a, b) => a.value - b.value);

  if (entries.length === 0) {
    throw new Error("Cannot calculate stats for empty distribution");
  }

  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];

  if (!firstEntry || !lastEntry) {
    throw new Error("Distribution has no entries");
  }

  const min = firstEntry.value;
  const max = lastEntry.value;
  const unique = entries.length;

  // Calculate median (50th percentile)
  const median = getPercentile(distribution, 0.5);

  // Calculate 95th percentile
  const p95 = getPercentile(distribution, 0.95);

  return {
    min,
    max,
    median,
    p95,
    total,
    unique,
  };
}
