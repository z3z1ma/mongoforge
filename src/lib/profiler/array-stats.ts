/**
 * Array length statistics extraction
 */

import { ArrayLengthStats } from '../../types/data-model.js';

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = (p / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return (sortedArray[lower] ?? 0) * (1 - weight) + (sortedArray[upper] ?? 0) * weight;
}

/**
 * Calculate mean
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Extract array length statistics for a field path
 */
export function calculateArrayStats(fieldPath: string, lengths: number[]): ArrayLengthStats {
  if (lengths.length === 0) {
    return {
      fieldPath,
      observedLengths: [],
      minLen: 0,
      maxLen: 0,
      p50Len: 0,
      p90Len: 0,
      p99Len: 0,
      mean: 0,
      stdDev: 0,
    };
  }

  const sorted = [...lengths].sort((a, b) => a - b);
  const avg = mean(sorted);

  return {
    fieldPath,
    observedLengths: lengths,
    minLen: sorted[0] ?? 0,
    maxLen: sorted[sorted.length - 1] ?? 0,
    p50Len: Math.round(percentile(sorted, 50)),
    p90Len: Math.round(percentile(sorted, 90)),
    p99Len: Math.round(percentile(sorted, 99)),
    mean: avg,
    stdDev: stdDev(sorted, avg),
  };
}

/**
 * Extract all array fields and their lengths from documents
 */
export function extractArrayLengths(documents: any[]): Map<string, number[]> {
  const arrayLengths = new Map<string, number[]>();

  function traverse(obj: any, pathPrefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Skip metadata fields
      if (key.startsWith('__')) continue;

      if (Array.isArray(value)) {
        // Record array length
        if (!arrayLengths.has(fieldPath)) {
          arrayLengths.set(fieldPath, []);
        }
        arrayLengths.get(fieldPath)!.push(value.length);

        // Traverse array elements if they are objects
        value.forEach((item) => {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            traverse(item, `${fieldPath}[]`);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
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
export function calculateAllArrayStats(documents: any[]): Map<string, ArrayLengthStats> {
  const arrayLengths = extractArrayLengths(documents);
  const stats = new Map<string, ArrayLengthStats>();

  for (const [fieldPath, lengths] of arrayLengths.entries()) {
    stats.set(fieldPath, calculateArrayStats(fieldPath, lengths));
  }

  return stats;
}
