/**
 * Numeric range statistics extraction
 * Analyzes numeric fields and calculates min/max/mean/median constraints
 */

import { NumericRangeStats } from '../../types/data-model.js';
import { calculateFrequencies, calculateDistributionStats } from '../../utils/frequency-map.js';

/**
 * Determine if a value is an integer or float
 */
function detectNumericType(values: number[]): 'integer' | 'float' {
  return values.every((v) => Number.isInteger(v)) ? 'integer' : 'float';
}

/**
 * Calculate mean from frequency distribution
 */
function calculateMean(distribution: Record<string, number>): number {
  let sum = 0;
  let count = 0;

  for (const [valueStr, freq] of Object.entries(distribution)) {
    const value = Number(valueStr);
    sum += value * freq;
    count += freq;
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Calculate standard deviation from frequency distribution
 */
function calculateStdDev(distribution: Record<string, number>, mean: number): number {
  let sumSquaredDiff = 0;
  let count = 0;

  for (const [valueStr, freq] of Object.entries(distribution)) {
    const value = Number(valueStr);
    sumSquaredDiff += Math.pow(value - mean, 2) * freq;
    count += freq;
  }

  return count > 1 ? Math.sqrt(sumSquaredDiff / (count - 1)) : 0;
}

/**
 * Extract numeric statistics for a field path
 */
export function calculateNumericStats(fieldPath: string, values: number[]): NumericRangeStats {
  if (values.length === 0) {
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
      valuesAnalyzed: 0,
      valueType: 'integer',
      allPositive: true,
      mean: 0,
      stdDev: 0,
    };
  }

  // Calculate frequency distribution
  const distribution = calculateFrequencies(values);

  // Calculate distribution statistics
  const stats = calculateDistributionStats(distribution);

  // Determine numeric type
  const valueType = detectNumericType(values);

  // Check if all values are positive
  const allPositive = values.every((v) => v >= 0);

  // Calculate mean
  const mean = calculateMean(distribution);

  // Calculate standard deviation
  const stdDev = calculateStdDev(distribution, mean);

  return {
    fieldPath,
    distribution,
    stats,
    valuesAnalyzed: values.length,
    valueType,
    allPositive,
    mean,
    stdDev,
  };
}

/**
 * Extract all numeric fields and their values from documents
 * Traverses nested objects and arrays to find all numeric leaf fields
 */
export function extractNumericValues(documents: any[]): Map<string, number[]> {
  const numericValues = new Map<string, number[]>();

  function traverse(obj: any, pathPrefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Skip metadata fields
      if (key.startsWith('__')) continue;

      if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
        // Record numeric value
        if (!numericValues.has(fieldPath)) {
          numericValues.set(fieldPath, []);
        }
        numericValues.get(fieldPath)!.push(value);
      } else if (Array.isArray(value)) {
        // Traverse array elements
        value.forEach((item) => {
          if (typeof item === 'number' && !isNaN(item) && isFinite(item)) {
            // Record array element numeric value
            const arrayFieldPath = `${fieldPath}[]`;
            if (!numericValues.has(arrayFieldPath)) {
              numericValues.set(arrayFieldPath, []);
            }
            numericValues.get(arrayFieldPath)!.push(item);
          } else if (typeof item === 'object' && item !== null) {
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
  return numericValues;
}

/**
 * Calculate statistics for all numeric fields
 */
export function calculateAllNumericStats(documents: any[]): Map<string, NumericRangeStats> {
  const numericValues = extractNumericValues(documents);
  const stats = new Map<string, NumericRangeStats>();

  for (const [fieldPath, values] of numericValues.entries()) {
    stats.set(fieldPath, calculateNumericStats(fieldPath, values));
  }

  return stats;
}
