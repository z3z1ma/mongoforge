/**
 * Numeric range statistics extraction
 * Analyzes numeric fields and calculates min/max/mean/median constraints
 */

import { NumericRangeStats } from "../../types/data-model.js";
import {
  calculateFrequencies,
  calculateDistributionStats,
} from "../../utils/frequency-map.js";

/**
 * Determine if a value is an integer or float
 */
function detectNumericType(values: number[]): "integer" | "float" {
  return values.every((v) => Number.isInteger(v)) ? "integer" : "float";
}

/**
 * Calculate mean from frequency distribution
 */
function calculateMean(distribution: Record<string, number>): number {
  let sum = 0;
  let count = 0;

  for (const valueStr in distribution) {
    const freq = distribution[valueStr];
    if (freq === undefined) continue;
    const value = Number(valueStr);
    sum += value * freq;
    count += freq;
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Calculate standard deviation from frequency distribution
 */
function calculateStdDev(
  distribution: Record<string, number>,
  mean: number,
): number {
  let sumSquaredDiff = 0;
  let count = 0;

  for (const valueStr in distribution) {
    const freq = distribution[valueStr];
    if (freq === undefined) continue;
    const value = Number(valueStr);
    sumSquaredDiff += Math.pow(value - mean, 2) * freq;
    count += freq;
  }

  return count > 1 ? Math.sqrt(sumSquaredDiff / (count - 1)) : 0;
}

/**
 * Accumulator for incremental numeric statistics profiling
 */
export class NumericStatsAccumulator {
  private distributions = new Map<string, Record<string, number>>();
  private distributionSizes = new Map<string, number>();
  private valuesAnalyzed = new Map<string, number>();
  private allPositive = new Map<string, boolean>();
  private allInteger = new Map<string, boolean>();

  /**
   * Add a document to the accumulation
   */
  addDocument(doc: any): void {
    this.traverse(doc);
  }

  /**
   * Recursive traversal to find numeric fields and record their values
   */
  private traverse(obj: any, pathPrefix = ""): void {
    if (obj === null || typeof obj !== "object") return;

    for (const key in obj) {
      const value = obj[key];
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Skip metadata fields
      if (key.startsWith("__")) continue;

      if (typeof value === "number" && !isNaN(value) && isFinite(value)) {
        this.recordValue(fieldPath, value);
      } else if (Array.isArray(value)) {
        // Traverse array elements
        const arrayFieldPath = `${fieldPath}[]`;
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === "number" && !isNaN(item) && isFinite(item)) {
            this.recordValue(arrayFieldPath, item);
          } else if (typeof item === "object" && item !== null) {
            this.traverse(item, arrayFieldPath);
          }
        }
      } else if (typeof value === "object" && value !== null) {
        // Traverse nested objects
        this.traverse(value, fieldPath);
      }
    }
  }

  private recordValue(fieldPath: string, value: number): void {
    // Record frequency with cardinality limit to prevent OOM
    let distribution = this.distributions.get(fieldPath);
    const valStr = String(value);

    if (!distribution) {
      distribution = {};
      this.distributions.set(fieldPath, distribution);
      this.distributionSizes.set(fieldPath, 0);
    }

    // Only track individual frequencies if cardinality is reasonably low
    // If it exceeds 1000 unique values, it's likely not an enum and we save memory
    const currentSize = this.distributionSizes.get(fieldPath) || 0;
    if (distribution[valStr] !== undefined) {
      distribution[valStr]++;
    } else if (currentSize < 1000) {
      distribution[valStr] = 1;
      this.distributionSizes.set(fieldPath, currentSize + 1);
    }

    // Track total count
    this.valuesAnalyzed.set(
      fieldPath,
      (this.valuesAnalyzed.get(fieldPath) || 0) + 1,
    );

    // Track positivity
    if (value < 0) {
      this.allPositive.set(fieldPath, false);
    } else if (!this.allPositive.has(fieldPath)) {
      this.allPositive.set(fieldPath, true);
    }

    // Track integer type
    if (!Number.isInteger(value)) {
      this.allInteger.set(fieldPath, false);
    } else if (!this.allInteger.has(fieldPath)) {
      this.allInteger.set(fieldPath, true);
    }
  }

  /**
   * Get calculated statistics for all tracked numeric fields
   */
  getStats(): Map<string, NumericRangeStats> {
    const stats = new Map<string, NumericRangeStats>();

    for (const [fieldPath, distribution] of this.distributions.entries()) {
      const distStats = calculateDistributionStats(distribution);
      const mean = calculateMean(distribution);
      const stdDev = calculateStdDev(distribution, mean);

      stats.set(fieldPath, {
        fieldPath,
        distribution,
        stats: distStats,
        valuesAnalyzed: this.valuesAnalyzed.get(fieldPath) || 0,
        valueType: this.allInteger.get(fieldPath) ? "integer" : "float",
        allPositive: this.allPositive.get(fieldPath) ?? true,
        mean,
        stdDev,
      });
    }

    return stats;
  }
}

/**
 * Extract numeric statistics for a field path
 */
export function calculateNumericStats(
  fieldPath: string,
  values: number[],
): NumericRangeStats {
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
      valueType: "integer",
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

  function traverse(obj: any, pathPrefix = ""): void {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // Skip metadata fields
      if (key.startsWith("__")) continue;

      if (typeof value === "number" && !isNaN(value) && isFinite(value)) {
        // Record numeric value
        if (!numericValues.has(fieldPath)) {
          numericValues.set(fieldPath, []);
        }
        numericValues.get(fieldPath)!.push(value);
      } else if (Array.isArray(value)) {
        // Traverse array elements
        value.forEach((item) => {
          if (typeof item === "number" && !isNaN(item) && isFinite(item)) {
            // Record array element numeric value
            const arrayFieldPath = `${fieldPath}[]`;
            if (!numericValues.has(arrayFieldPath)) {
              numericValues.set(arrayFieldPath, []);
            }
            numericValues.get(arrayFieldPath)!.push(item);
          } else if (typeof item === "object" && item !== null) {
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
  return numericValues;
}

/**
 * Calculate statistics for all numeric fields
 */
export function calculateAllNumericStats(
  documents: any[],
): Map<string, NumericRangeStats> {
  const numericValues = extractNumericValues(documents);
  const stats = new Map<string, NumericRangeStats>();

  for (const [fieldPath, values] of numericValues.entries()) {
    stats.set(fieldPath, calculateNumericStats(fieldPath, values));
  }

  return stats;
}
