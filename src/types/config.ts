/**
 * Configuration types for MongoForge
 */

import {
  ArrayLenPolicy,
  IdPolicy,
  UniquenessScope,
  SizeProxyType,
} from './data-model';

/**
 * SourceConfig - MongoDB source configuration
 */
export interface SourceConfig {
  uri: string; // MongoDB connection URI
  database: string;
  collection: string;
  sampleSize: number;
  samplingStrategy: 'random' | 'firstN' | 'timeWindowed';
  timeWindow?: {
    field: string; // Field name for time-based sampling
    start: Date;
    end: Date;
  };
}

/**
 * SamplingConfig - Sampling behavior configuration
 */
export interface SamplingConfig {
  strategy: 'random' | 'firstN' | 'timeWindowed';
  size: number;
  timeWindow?: {
    field: string;
    start: Date;
    end: Date;
  };
}

/**
 * ConstraintsConfig - Constraints extraction configuration
 */
export interface ConstraintsConfig {
  arrayLenPolicy: ArrayLenPolicy;
  percentiles: number[]; // e.g., [50, 90, 99]
  clampRange: [number, number]; // e.g., [1, 99] for p1-p99
  sizeProxy: SizeProxyType;
  sizeBuckets: Array<{
    id: string;
    min: number;
    max: number;
  }>;
  keyFields: {
    _id: {
      policy: IdPolicy;
      enforceUniqueness: boolean;
      uniquenessScope: UniquenessScope;
    };
    additionalKeys: Array<{
      fieldPath: string;
      enforceUniqueness: boolean;
      uniquenessScope: UniquenessScope;
    }>;
  };
}

/**
 * GenerationConfig - Document generation configuration
 */
export interface GenerationConfig {
  docCount: number;
  seed?: string | number;
  batchSize?: number; // For MongoDB insertion
  schemaPath?: string; // Path to GenerationSchema JSON
  constraintsPath?: string; // Path to ConstraintsProfile JSON
}

/**
 * OutputConfig - Output destination configuration
 */
export interface OutputConfig {
  format: 'ndjson' | 'json';
  destination: string; // File path, "stdout", or MongoDB URI
  prettyPrint?: boolean; // For JSON format
}

/**
 * MongoForgeConfig - Complete configuration
 */
export interface MongoForgeConfig {
  source?: SourceConfig;
  sampling?: SamplingConfig;
  constraints?: ConstraintsConfig;
  generation?: GenerationConfig;
  output?: OutputConfig;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}
