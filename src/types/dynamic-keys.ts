/**
 * Type definitions for dynamic key inference and array length distribution features
 * Feature: 002-dynamic-key-inference
 */

/**
 * Frequency distribution mapping values to occurrence counts
 * Serialized as plain object in JSON artifacts
 */
export interface FrequencyDistribution {
  [value: string]: number;
}

/**
 * Statistical summary of a frequency distribution
 */
export interface DistributionStats {
  /** Minimum observed value */
  min: number;

  /** Maximum observed value */
  max: number;

  /** Median value (50th percentile) */
  median: number;

  /** 95th percentile value */
  p95: number;

  /** Total number of observations */
  total: number;

  /** Number of unique values */
  unique: number;
}

/**
 * Pattern type for dynamic keys
 */
export type DynamicKeyPattern =
  | "UUID"
  | "MONGODB_OBJECTID"
  | "ULID"
  | "NUMERIC_ID"
  | "PREFIXED_ID"
  | "CUSTOM";

/**
 * Detection confidence level
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Metadata about detected dynamic key pattern
 */
export interface DynamicKeyMetadata {
  /** Whether dynamic key pattern was detected */
  enabled: boolean;

  /** Detected pattern type */
  pattern: DynamicKeyPattern;

  /** Custom regex pattern (if pattern is 'CUSTOM') */
  customPattern?: string;

  /** Confidence in detection (0.0 - 1.0) */
  confidence: number;

  /** Confidence level category */
  confidenceLevel: ConfidenceLevel;

  /** Distribution of key counts across documents */
  countDistribution: FrequencyDistribution;

  /** Statistical summary of key counts */
  countStats: DistributionStats;

  /** Number of documents analyzed */
  documentsAnalyzed: number;

  /** Total unique keys observed */
  uniqueKeysObserved: number;

  /** Example keys (max 10 samples) */
  exampleKeys: string[];
}

/**
 * Schema information for values associated with dynamic keys
 */
export interface DynamicKeyValueSchema {
  /** Observed value types (e.g., 'string', 'number', 'object', 'array') */
  types: string[];

  /** Probability of each type (same order as types array, must sum to 1.0) */
  typeProbabilities: number[];

  /** JSON Schema for each type (same order as types array) */
  schemas: any[];

  /** Whether all observed values were of the same type */
  isUniformType: boolean;

  /** Most common type */
  dominantType: string;
}

/**
 * Statistics about array lengths for a field path
 * Replaces exhaustive array storage with frequency distribution
 */
export interface ArrayLengthStats {
  /** Field path (e.g., 'users.orders.items') */
  fieldPath: string;

  /** Distribution of array lengths */
  distribution: FrequencyDistribution;

  /** Statistical summary */
  stats: DistributionStats;

  /** Number of arrays analyzed */
  arraysAnalyzed: number;
}

/**
 * Configuration for dynamic key detection
 */
export interface DynamicKeyDetectionConfig {
  /** Threshold for number of unique keys to trigger detection (default: 50) */
  threshold: number;

  /** Regex patterns for key format matching */
  patterns: {
    name: string;
    regex: string;
  }[];

  /** Minimum percentage of keys that must match a pattern (0.0 - 1.0) */
  minPatternMatch: number;

  /** Minimum confidence score to enable dynamic key treatment (0.0 - 1.0) */
  confidenceThreshold: number;

  /** Field paths to force as static keys (override detection) */
  forceStaticPaths: string[];

  /** Field paths to force as dynamic keys (override detection) */
  forceDynamicPaths: string[];
}

/**
 * Default configuration for dynamic key detection
 */
export const DEFAULT_DYNAMIC_KEY_CONFIG: DynamicKeyDetectionConfig = {
  threshold: 100,
  patterns: [
    {
      name: "UUID",
      regex: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    },
    {
      name: "MONGODB_OBJECTID",
      regex: "^[0-9a-f]{24}$",
    },
    {
      name: "ULID",
      regex: "^[0-9A-Z]{26}$",
    },
    {
      name: "NUMERIC_ID",
      regex: "^\\d{6,20}$",
    },
    {
      name: "PREFIXED_ID",
      regex: "^(user|doc|item|order)_[a-z0-9]{8,32}$",
    },
  ],
  minPatternMatch: 0.8,
  confidenceThreshold: 0.7,
  forceStaticPaths: [],
  forceDynamicPaths: [],
};
