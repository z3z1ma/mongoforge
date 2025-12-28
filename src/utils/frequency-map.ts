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

// Internal cache key for prepared distributions to avoid repeated Object.entries/reduce calls
const PREPARED_DISTRIBUTION = Symbol("prepared_distribution");

interface PreparedDistribution {
  entries: [string, number][];
  total: number;
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
  // Use cached prepared state if available
  let prepared = (distribution as any)[PREPARED_DISTRIBUTION] as
    | PreparedDistribution
    | undefined;

  if (!prepared) {
    const entries = Object.entries(distribution) as [string, number][];

    if (entries.length === 0) {
      throw new Error("Cannot sample from empty distribution");
    }

    // Calculate total frequency
    const total = entries.reduce((sum, [, count]) => sum + count, 0);

    prepared = { entries, total };

    // Cache it on the distribution object
    try {
      Object.defineProperty(distribution, PREPARED_DISTRIBUTION, {
        value: prepared,
        enumerable: false,
        configurable: true,
      });
    } catch (e) {
      // Fallback for non-extensible objects, though rare for our use case
    }
  }

  const { entries, total } = prepared;

  // Use provided random value or generate a new one
  const random = randomValue * total;

  // Find the value corresponding to this random number
  let cumulative = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    cumulative += entry[1];
    if (random < cumulative) {
      return entry[0];
    }
  }

  // Fallback to last value (should never reach here due to floating point precision)
  const lastEntry = entries[entries.length - 1];
  return lastEntry ? lastEntry[0] : "";
}

/**
 * Calculate comprehensive distribution statistics
 *
 * @param distribution - Frequency distribution
 * @returns Statistical summary including min, max, median, p95, total, and unique
 */
export function calculateDistributionStats(
  distribution: FrequencyDistribution,
): DistributionStats {
  const sortedEntries: { value: number; count: number }[] = [];

  for (const key in distribution) {
    const count = distribution[key];
    if (count !== undefined) {
      sortedEntries.push({ value: Number(key), count });
    }
  }

  if (sortedEntries.length === 0) {
    throw new Error("Cannot calculate stats for empty distribution");
  }

  sortedEntries.sort((a, b) => a.value - b.value);

  let total = 0;
  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    if (entry) {
      total += entry.count;
    }
  }

  const first = sortedEntries[0];
  const last = sortedEntries[sortedEntries.length - 1];

  if (!first || !last) {
    throw new Error("Distribution has no entries");
  }

  const min = first.value;
  const max = last.value;
  const unique = sortedEntries.length;

  // Calculate percentiles in a single pass to be efficient
  let median = min;
  let p95 = min;
  const medianTarget = total * 0.5;
  const p95Target = total * 0.95;

  let cumulative = 0;
  let medianFound = false;
  let p95Found = false;

  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    if (!entry) continue;

    cumulative += entry.count;
    if (!medianFound && cumulative >= medianTarget) {
      median = entry.value;
      medianFound = true;
    }
    if (!p95Found && cumulative >= p95Target) {
      p95 = entry.value;
      p95Found = true;
      break; // Found everything we need
    }
  }

  return {
    min,
    max,
    median,
    p95,
    total,
    unique,
  };
}

/**
 * Calculate a specific percentile from a frequency distribution
 * Note: Use calculateDistributionStats if you need multiple stats to be more efficient.
 */
export function getPercentile(
  distribution: FrequencyDistribution,
  percentile: number,
): number {
  if (percentile < 0 || percentile > 1) {
    throw new Error("Percentile must be between 0.0 and 1.0");
  }

  const sortedEntries: { value: number; count: number }[] = [];
  for (const key in distribution) {
    const count = distribution[key];
    if (count !== undefined) {
      sortedEntries.push({ value: Number(key), count });
    }
  }

  if (sortedEntries.length === 0) {
    throw new Error("Cannot calculate percentile of empty distribution");
  }

  sortedEntries.sort((a, b) => a.value - b.value);

  let total = 0;
  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    if (entry) {
      total += entry.count;
    }
  }

  const targetCount = total * percentile;
  let cumulative = 0;
  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    if (!entry) continue;

    cumulative += entry.count;
    if (cumulative >= targetCount) {
      return entry.value;
    }
  }

  const last = sortedEntries[sortedEntries.length - 1];
  return last ? last.value : 0;
}
