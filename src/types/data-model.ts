/**
 * Core data model types for MongoForge
 * These structures flow through the pipeline: sampling → normalization → inference → synthesis → generation → validation
 */

import { ObjectId } from 'mongodb';

/**
 * SampleDocument - Raw document retrieved from MongoDB during discovery phase
 */
export interface SampleDocument {
  _id: ObjectId | string | number;
  [key: string]: any;
  __metadata: {
    collectionName: string;
    sampledAt: Date;
    sampleIndex: number;
  };
}

/**
 * TypeHint - Metadata for MongoDB type → JSON Schema type conversion
 */
export interface TypeHint {
  originalType: string; // "ObjectId", "Date", "Decimal128", etc.
  jsonSchemaType: string; // "string", "number", etc.
  jsonSchemaFormat?: string; // "objectid", "date-time", etc.
}

/**
 * NormalizedDocument - Sample document with MongoDB types converted to JSON Schema representations
 */
export interface NormalizedDocument {
  _id: string;
  [key: string]: any;
  __typeHints: Record<string, TypeHint>;
}

/**
 * InferredSchema - Raw probabilistic schema from mongodb-schema library
 */
export interface InferredSchemaField {
  name: string;
  path: string; // JSONPath (e.g., "user.addresses.city")
  count: number;
  type: string | string[];
  probability: number; // 0.0 to 1.0
  types: Array<{
    name: string;
    probability: number;
    unique?: number;
    values?: any[];
  }>;
  lengths?: number[]; // For arrays
  fields?: Record<string, InferredSchemaField>; // For nested documents
}

export interface InferredSchema {
  count: number; // Number of documents analyzed
  fields: Record<string, InferredSchemaField>;
}

/**
 * ArrayLengthStats - Statistical summary of array lengths for a field
 */
export interface ArrayLengthStats {
  fieldPath: string;
  observedLengths: number[];
  minLen: number;
  maxLen: number;
  p50Len: number; // Median
  p90Len: number;
  p99Len: number;
  mean: number;
  stdDev: number;
}

/**
 * DocumentSizeBucket - Document size classification for distribution matching
 */
export type SizeProxyType = 'leafFieldCount' | 'arrayLengthSum' | 'byteSize';

export interface DocumentSizeBucket {
  bucketId: string; // e.g., "small", "medium", "large"
  sizeRange: {
    min: number;
    max: number;
  };
  sizeProxy: SizeProxyType;
  count: number;
  probability: number; // 0.0 to 1.0
}

/**
 * ConstraintsProfile - Statistical constraints for generation
 */
export type KeyFieldType = 'ObjectId' | 'string' | 'number' | 'UUID';
export type IdPolicy = 'objectid' | 'uuid' | 'string' | 'number' | 'inferred';
export type UniquenessScope = 'batch' | 'run';
export type ArrayLenPolicy = 'minmax' | 'percentileClamp';

export interface KeyFieldConfig {
  type: KeyFieldType;
  policy: IdPolicy;
  enforceUniqueness: boolean;
  uniquenessScope: UniquenessScope;
}

export interface AdditionalKeyConfig {
  fieldPath: string;
  type: string;
  enforceUniqueness: boolean;
  uniquenessScope: UniquenessScope;
}

export interface ConstraintsProfile {
  arrayStats: Map<string, ArrayLengthStats>;
  sizeBuckets: DocumentSizeBucket[];
  keyFields: {
    _id: KeyFieldConfig;
    additionalKeys: AdditionalKeyConfig[];
  };
  config: {
    arrayLenPolicy: ArrayLenPolicy;
    percentiles: number[];
    clampRange: [number, number];
  };
}

/**
 * GenerationSchema - JSON Schema draft-07 with vendor extensions
 */
export interface XGenArrayLen {
  min: number;
  max: number;
  p50: number;
  p90: number;
  p99: number;
  strategy: 'minmax' | 'percentile';
}

export interface XGenExtensions {
  key?: boolean;
  mongoType?: string;
  arrayLen?: XGenArrayLen;
  sizeWeight?: number;
}

export interface GenerationSchemaProperty {
  type: string | string[];
  format?: string;
  items?: GenerationSchemaProperty;
  properties?: Record<string, GenerationSchemaProperty>;
  required?: string[];
  minItems?: number;
  maxItems?: number;
  'x-gen'?: XGenExtensions;
}

export interface GenerationSchema {
  $schema: string;
  type: 'object';
  title: string;
  properties: Record<string, GenerationSchemaProperty>;
  required: string[];
  additionalProperties: boolean;
}

/**
 * SyntheticDocument - Generated document conforming to GenerationSchema
 */
export interface SyntheticDocument {
  _id: string | number;
  [key: string]: any;
  __generationMeta?: {
    seed: string | number;
    generatedAt: Date;
    schemaVersion: string;
    sizeBucket: string;
  };
}

/**
 * RunManifest - Audit trail for generation runs
 */
export interface RunManifest {
  version: string;
  tool: {
    name: string;
    version: string;
  };
  run: {
    id: string;
    timestamp: string;
    phase: 'discovery' | 'generation' | 'validation';
  };
  config: {
    source?: {
      uri: string;
      database: string;
      collection: string;
      sampleSize: number;
      samplingStrategy: string;
    };
    generation?: {
      docCount: number;
      seed: string | number;
      schemaHash: string;
      constraintsHash: string;
    };
    output?: {
      format: 'ndjson' | 'json';
      destination: string;
    };
  };
  artifacts: {
    inferredSchema?: {
      path: string;
      hash: string;
    };
    generationSchema?: {
      path: string;
      hash: string;
    };
    constraints?: {
      path: string;
      hash: string;
    };
    output?: {
      path: string;
      hash?: string;
      size?: number;
    };
  };
  metrics?: {
    duration: number;
    documentsProcessed: number;
    throughput?: number;
    memoryPeak?: number;
  };
}

/**
 * ValidationReport - Quality comparison between sample and generated data
 */
export interface SchemaViolation {
  documentIndex: number;
  errors: Array<{
    path: string;
    message: string;
  }>;
}

export interface ArrayLengthComparison {
  sample: {
    minLen: number;
    maxLen: number;
    p50Len: number;
    p90Len: number;
    p99Len: number;
  };
  generated: {
    minLen: number;
    maxLen: number;
    p50Len: number;
    p90Len: number;
    p99Len: number;
  };
  deviation: {
    p50: number;
    p90: number;
    p99: number;
  };
  passed: boolean;
}

export interface SizeBucketComparison {
  bucketId: string;
  sample: {
    count: number;
    probability: number;
  };
  generated: {
    count: number;
    probability: number;
  };
  deviation: number;
  passed: boolean;
}

export interface KeyUniquenessCheck {
  totalKeys: number;
  uniqueKeys: number;
  duplicates: number;
  passed: boolean;
}

export interface ValidationReport {
  schemaConformance: {
    totalDocuments: number;
    validDocuments: number;
    invalidDocuments: number;
    conformanceRate: number;
    violations: SchemaViolation[];
  };
  arrayLengthComparison: Record<string, ArrayLengthComparison>;
  documentSizeComparison: {
    buckets: SizeBucketComparison[];
  };
  keyUniqueness: {
    _id: KeyUniquenessCheck;
    additionalKeys: Map<string, KeyUniquenessCheck>;
  };
}
