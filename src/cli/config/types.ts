/**
 * CLI configuration types
 */

import {
  ArrayLenPolicy,
  IdPolicy,
  UniquenessScope,
  SizeProxyType,
} from "../../types/data-model.js";

/**
 * Source MongoDB connection configuration
 */
export interface SourceConfig {
  uri: string;
  database: string;
  collection: string;
}

/**
 * Sampling configuration
 */
export interface SamplingConfig {
  sampleSize: number;
  strategy: "random" | "first-n" | "time-windowed";
  timeField?: string; // Required if strategy is 'time-windowed'
}

/**
 * Constraints configuration
 */
export interface ConstraintsConfig {
  arrayLenPolicy: ArrayLenPolicy;
  percentiles: number[];
  clampRange: [number, number];
  sizeProxy: SizeProxyType;
}

/**
 * Key fields configuration
 */
export interface KeysConfig {
  idPolicy: IdPolicy;
  keyFields: string[];
  enforceUniqueKeys: boolean;
  uniquenessScope: UniquenessScope;
}

/**
 * Output configuration
 */
export interface OutputConfig {
  dir: string;
}

/**
 * Synthesis configuration
 */
export interface SynthesisConfig {
  enforceRequired: boolean;
  requiredThreshold: number;
}

/**
 * Infer command configuration
 */
export interface InferConfig {
  source: SourceConfig;
  sampling: SamplingConfig;
  constraints: ConstraintsConfig;
  keys: KeysConfig;
  synthesis: SynthesisConfig;
  output: OutputConfig;
}

/**
 * Target MongoDB configuration for generation
 */
export interface TargetConfig {
  uri: string;
  database: string;
  collection: string;
  collectionSuffix?: string;
  batchSize: number;
  writeConcern: string;
  orderedInserts: boolean;
}

/**
 * Generation output configuration
 */
export interface GenerationOutputConfig {
  format: "ndjson" | "json";
  path: string; // File path or 'stdout'
  dir?: string; // Optional output directory
  splitFilesBy?: "size" | "count";
  splitSize?: number;
}

/**
 * Generate command configuration
 */
export interface GenerateConfig {
  generationSchema: string;
  constraints: string;
  docCount: number;
  seed?: string | number;
  output: GenerationOutputConfig;
  target?: TargetConfig;
  customGenerators?: string;
}

/**
 * Validation tolerances
 */
export interface ValidationTolerances {
  arrayLen: number; // Percentage
  docSize: number; // Percentage
}

/**
 * Validate command configuration
 */
export interface ValidateConfig {
  generationSchema: string;
  constraints: string;
  inputPath: string;
  samplePath?: string;
  outputPath: string;
  tolerances: ValidationTolerances;
}

/**
 * Complete configuration file structure
 */
export interface MongoForgeConfig {
  infer?: Partial<InferConfig>;
  generate?: Partial<GenerateConfig>;
  validate?: Partial<ValidateConfig>;
}

/**
 * CLI command options (from commander)
 */
export interface InferCommandOptions {
  sourceUri?: string;
  sourceDb?: string;
  sourceCollection?: string;
  sampleSize?: number;
  samplingStrategy?: "random" | "first-n" | "time-windowed";
  timeField?: string;
  outputDir?: string;
  arrayLenPolicy?: ArrayLenPolicy;
  percentiles?: string; // Comma-separated
  clampRange?: string; // Comma-separated [low,high]
  idPolicy?: IdPolicy;
  keyFields?: string; // Comma-separated
  enforceUniqueKeys?: boolean;
  uniquenessScope?: UniquenessScope;
  enforceRequired?: boolean;
  requiredThreshold?: number;
  dynamicKeyThreshold?: number;
  noDynamicKeys?: boolean;
  storeValues?: boolean;
  config?: string;
  logLevel?: string;
}

export interface GenerateCommandOptions {
  generationSchema?: string;
  constraints?: string;
  docCount?: number;
  seed?: string;
  outputFormat?: "ndjson" | "json";
  outputPath?: string;
  outputDir?: string;
  splitFilesBy?: "size" | "count";
  splitSize?: number;
  targetUri?: string;
  targetDb?: string;
  targetCollection?: string;
  collectionSuffix?: string;
  batchSize?: number;
  writeConcern?: string;
  orderedInserts?: boolean;
  customGenerators?: string;
  config?: string;
  logLevel?: string;
}

export interface ValidateCommandOptions {
  generationSchema?: string;
  constraints?: string;
  inputPath?: string;
  samplePath?: string;
  outputPath?: string;
  toleranceArrayLen?: number;
  toleranceDocSize?: number;
  config?: string;
  logLevel?: string;
}
