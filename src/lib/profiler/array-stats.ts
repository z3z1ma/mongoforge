/**
 * Array length statistics extraction
 * Updated to use frequency distributions for compact storage (Feature: 002-dynamic-key-inference)
 */

import { ArrayLengthStats } from "../../types/dynamic-keys.js";
import {
  calculateFrequencies,
  calculateDistributionStats,
  getPercentile,
} from "../../utils/frequency-map.js";

/**
 * Extract array length statistics for a field path
 * Uses frequency distribution for compact storage instead of exhaustive length arrays
 */
export function calculateArrayStats(
  fieldPath: string,
  lengths: number[],
): ArrayLengthStats {
  if (lengths.length === 0) {
    return {
      fieldPath,
      distribution: {},
      stats: {
        min: 0,
        max: 0,
        median: 0,
        p95: 0,
        total: 0,
        unique: 0,
      },
      arraysAnalyzed: 0,
    };
  }

  // Calculate frequency distribution
  const distribution = calculateFrequencies(lengths);

  // Calculate distribution statistics
  const stats = calculateDistributionStats(distribution);

  return {
    fieldPath,
    distribution,
    stats,
    arraysAnalyzed: lengths.length,
  };
}

/**
 * Extract all array fields and their lengths from documents
 */
export function extractArrayLengths(documents: any[]): Map<string, number[]> {
  const arrayLengths = new Map<string, number[]>();

  function traverse(obj: any, pathPrefix = ""): void {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Skip metadata fields
      if (key.startsWith("__")) continue;

      if (Array.isArray(value)) {
        // Record array length
        if (!arrayLengths.has(fieldPath)) {
          arrayLengths.set(fieldPath, []);
        }
        arrayLengths.get(fieldPath)!.push(value.length);

        // Traverse array elements if they are objects
        value.forEach((item) => {
          if (
            typeof item === "object" &&
            item !== null &&
            !Array.isArray(item)
          ) {
            traverse(item, `${fieldPath}[]`);
          }
        });
      } else if (typeof value === "object" && value !== null) {
        // Traverse nested objects
        traverse(value, fieldPath);
      }
    }
  }

  documents.forEach((doc) => traverse(doc));
  return arrayLengths;
}

/**
 * Calculate statistics for all array fields
 */
export function calculateAllArrayStats(
  documents: any[],
): Map<string, ArrayLengthStats> {
  const arrayLengths = extractArrayLengths(documents);
  const stats = new Map<string, ArrayLengthStats>();

  for (const [fieldPath, lengths] of arrayLengths.entries()) {
    stats.set(fieldPath, calculateArrayStats(fieldPath, lengths));
  }

  return stats;
}

/**
 * Legacy format detection and conversion
 * Supports reading old constraints.json format with observedLengths: number[]
 */
export interface LegacyArrayLengthStats {
  fieldPath: string;
  observedLengths: number[];
  minLen: number;
  maxLen: number;
  p50Len: number;
  p90Len: number;
  p99Len: number;
  mean: number;
  stdDev: number;
}

/**
 * Detect if stats object is in legacy format
 */
export function isLegacyFormat(stats: any): stats is LegacyArrayLengthStats {
  return (
    stats &&
    typeof stats === "object" &&
    "observedLengths" in stats &&
    Array.isArray(stats.observedLengths)
  );
}

/**
 * Convert legacy array stats format to new frequency distribution format
 * Provides backward compatibility for old constraints.json files
 */
export function convertLegacyArrayStats(
  legacy: LegacyArrayLengthStats,
): ArrayLengthStats {
  const distribution = calculateFrequencies(legacy.observedLengths);
  const stats = calculateDistributionStats(distribution);

  return {
    fieldPath: legacy.fieldPath,
    distribution,
    stats,
    arraysAnalyzed: legacy.observedLengths.length,
  };
}

/**
 * Normalize array stats to new format (handles both legacy and new format)
 */
export function normalizeArrayStats(stats: any): ArrayLengthStats {
  if (isLegacyFormat(stats)) {
    return convertLegacyArrayStats(stats);
  }
  return stats as ArrayLengthStats;
}
