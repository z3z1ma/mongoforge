/**
 * Vendor keyword handlers for x-gen extensions in GenerationSchema
 * Updated to support frequency distribution format (Feature: 002-dynamic-key-inference)
 */

import {
  XGenExtensions,
  XGenArrayLen,
  TypeHint,
} from "../../types/data-model.js";
import { ArrayLengthStats } from "../../types/dynamic-keys.js";
import { logger } from "../../utils/logger.js";
import {
  sampleFromDistribution,
} from "../../utils/frequency-map.js";

/**
 * Apply x-gen.key vendor extension
 * Marks field as key-like (should have uniqueness preference during generation)
 */
export function applyKeyExtension(
  fieldPath: string,
  isKeyField: boolean,
  existingExtensions: XGenExtensions = {},
): XGenExtensions {
  if (!isKeyField) {
    return existingExtensions;
  }

  logger.debug("Applying x-gen.key extension", { fieldPath });

  return {
    ...existingExtensions,
    key: true,
  };
}

/**
 * Apply x-gen.mongoType vendor extension
 * Preserves original MongoDB type information for accurate generation
 */
export function applyMongoTypeExtension(
  fieldPath: string,
  typeHint: TypeHint | undefined,
  existingExtensions: XGenExtensions = {},
): XGenExtensions {
  if (!typeHint) {
    return existingExtensions;
  }

  logger.debug("Applying x-gen.mongoType extension", {
    fieldPath,
    mongoType: typeHint.originalType,
  });

  return {
    ...existingExtensions,
    mongoType: typeHint.originalType,
  };
}

/**
 * Apply x-gen.arrayLen vendor extension
 * Embeds array length distribution statistics for realistic generation
 * Updated to use new frequency distribution format
 */
export function applyArrayLenExtension(
  fieldPath: string,
  arrayStats: ArrayLengthStats | undefined,
  strategy: "minmax" | "percentile" = "percentile",
  existingExtensions: XGenExtensions = {},
): XGenExtensions {
  if (!arrayStats) {
    return existingExtensions;
  }

  logger.debug("Applying x-gen.arrayLen extension", {
    fieldPath,
    strategy,
    p50: arrayStats.stats.median,
    p95: arrayStats.stats.p95,
  });

  const arrayLen: XGenArrayLen = {
    min: arrayStats.stats.min,
    max: arrayStats.stats.max,
    p50: arrayStats.stats.median,
    p90: Math.round(arrayStats.stats.p95 * 0.95), // Approximate p90 from p95
    p99: arrayStats.stats.p95,
    strategy,
    distribution: arrayStats.distribution,
  };

  return {
    ...existingExtensions,
    arrayLen,
  };
}

/**
 * Build complete x-gen extensions object for a field
 */
export function buildXGenExtensions(options: {
  fieldPath: string;
  isKeyField?: boolean;
  typeHint?: TypeHint;
  arrayStats?: ArrayLengthStats;
  arrayLenStrategy?: "minmax" | "percentile";
}): XGenExtensions | undefined {
  let extensions: XGenExtensions = {};

  // Apply key extension
  if (options.isKeyField) {
    extensions = applyKeyExtension(options.fieldPath, true, extensions);
  }

  // Apply mongoType extension
  if (options.typeHint) {
    extensions = applyMongoTypeExtension(
      options.fieldPath,
      options.typeHint,
      extensions,
    );
  }

  // Apply arrayLen extension
  if (options.arrayStats) {
    extensions = applyArrayLenExtension(
      options.fieldPath,
      options.arrayStats,
      options.arrayLenStrategy || "percentile",
      extensions,
    );
  }

  // Return undefined if no extensions were applied
  return Object.keys(extensions).length > 0 ? extensions : undefined;
}

/**
 * Extract array length constraints from x-gen.arrayLen for JSON Schema minItems/maxItems
 */
export function extractArrayConstraints(
  arrayLen: XGenArrayLen | undefined,
  policy: "minmax" | "percentileClamp" = "percentileClamp",
  clampRange: [number, number] = [1, 99],
): { minItems?: number; maxItems?: number } {
  if (!arrayLen) {
    return {};
  }

  if (policy === "minmax") {
    return {
      minItems: arrayLen.min,
      maxItems: arrayLen.max,
    };
  }

  // percentileClamp: use p1-p99 range to avoid extreme outliers
  const [lowPercentile, highPercentile] = clampRange;

  // Simple interpolation for p1/p99 if not stored
  const minItems = lowPercentile <= 50 ? arrayLen.min : arrayLen.p50;
  const maxItems = highPercentile >= 99 ? arrayLen.p99 : arrayLen.p90;

  return {
    minItems: Math.max(0, minItems),
    maxItems: Math.max(minItems, maxItems),
  };
}

/**
 * Get recommended array length for generation based on strategy
 */
export function getRecommendedArrayLength(
  arrayLen: XGenArrayLen,
  randomValue = Math.random(),
): number {
  // If full frequency distribution is available, use it for exact weighted sampling
  if (arrayLen.distribution && Object.keys(arrayLen.distribution).length > 0) {
    try {
      return sampleFromDistribution(arrayLen.distribution, randomValue);
    } catch (error) {
      logger.warn("Failed to sample from array length distribution", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (arrayLen.strategy === "minmax") {
    // Uniform distribution between min and max
    return Math.floor(
      arrayLen.min + randomValue * (arrayLen.max - arrayLen.min + 1),
    );
  }

  // Percentile-based strategy: weight toward p50-p90 range
  if (randomValue < 0.5) {
    // 50% chance: between min and p50
    const range = arrayLen.p50 - arrayLen.min;
    return Math.floor(arrayLen.min + randomValue * 2 * range);
  } else if (randomValue < 0.9) {
    // 40% chance: between p50 and p90
    const range = arrayLen.p90 - arrayLen.p50;
    return Math.floor(arrayLen.p50 + ((randomValue - 0.5) / 0.4) * range);
  } else {
    // 10% chance: between p90 and p99
    const range = arrayLen.p99 - arrayLen.p90;
    return Math.floor(arrayLen.p90 + ((randomValue - 0.9) / 0.1) * range);
  }
}

/**
 * Add x-array-length-distribution annotation to array schema properties
 * This stores the complete frequency distribution for more accurate generation
 * (Feature: 002-dynamic-key-inference)
 */
export function addArrayLengthDistribution(
  property: any,
  arrayStats: ArrayLengthStats | undefined,
): void {
  if (!arrayStats || property.type !== "array") {
    return;
  }

  logger.debug("Adding x-array-length-distribution annotation", {
    fieldPath: arrayStats.fieldPath,
    unique: arrayStats.stats.unique,
    total: arrayStats.stats.total,
  });

  property["x-array-length-distribution"] = {
    distribution: arrayStats.distribution,
    stats: arrayStats.stats,
  };
}
