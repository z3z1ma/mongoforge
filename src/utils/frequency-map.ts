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
 * @param values - Array of numeric or string values to analyze
 * @returns Frequency distribution mapping stringified values to counts
 *
 * @example
 * calculateFrequencies([1, 2, 2, 3, 3, 3])
 * // Returns: { "1": 1, "2": 2, "3": 3 }
 */
export function calculateFrequencies(
  values: (number | string)[],
): FrequencyDistribution {
  const distribution: FrequencyDistribution = {};

  for (const value of values) {
    updateFrequencies(distribution, value);
  }

  return distribution;
}

/**
 * Update a frequency distribution with a new value
 *
 * @param distribution - Frequency distribution to update
 * @param value - New numeric or string value to add
 */
export function updateFrequencies(
  distribution: FrequencyDistribution,
  value: number | string,
): void {
  const key = String(value);
  distribution[key] = (distribution[key] || 0) + 1;
}

/**
 * Sample a value from a frequency distribution
 * Uses weighted random selection based on frequencies
 *
 * @param distribution - Frequency distribution to sample from
 * @param randomValue - Optional random value between 0 and 1 (defaults to Math.random())
 * @returns Sampled value as string (key from distribution)
 *
 * @example
 * sampleFromDistribution({ "1": 50, "2": 30, "3": 20 })
 * // Returns: "1", "2", or "3" (weighted by frequency)
 */
export function sampleFromDistribution(
  distribution: FrequencyDistribution,
  randomValue = Math.random(),
): string {
  const entries = Object.entries(distribution);

  if (entries.length === 0) {
    throw new Error("Cannot sample from empty distribution");
  }

  // Calculate total frequency
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  // Use provided random value or generate a new one
  const random = randomValue * total;

  // Find the value corresponding to this random number
  let cumulative = 0;
  for (const [value, count] of entries) {
    cumulative += count;
    if (random < cumulative) {
      return value;
    }
  }

  // Fallback to last value (should never reach here due to floating point precision)
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry) {
    throw new Error("Distribution has no entries");
  }
  return lastEntry[0];
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
