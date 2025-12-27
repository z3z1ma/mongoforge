# Data Model: Dynamic Key Inference & Optimized Array Length Storage

**Feature**: `002-dynamic-key-inference`
**Date**: 2025-12-26
**Status**: Design Complete

## Overview

This document defines the TypeScript interfaces and data structures for representing dynamic key patterns and frequency distributions in the mongoforge schema inference and document generation pipeline.

---

## Core Entities

### 1. Frequency Distribution

**Purpose**: Compact representation of value frequencies for arrays and dynamic key counts

**TypeScript Interface**:

```typescript
/**
 * Frequency distribution mapping values to occurrence counts
 * Serialized as plain object in JSON artifacts
 */
interface FrequencyDistribution {
  [value: string]: number;
}

/**
 * Statistical summary of a frequency distribution
 */
interface DistributionStats {
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
```

**Example**:
```json
{
  "distribution": {
    "1": 150,
    "2": 80,
    "5": 20,
    "10": 5
  },
  "stats": {
    "min": 1,
    "max": 10,
    "median": 2,
    "p95": 5,
    "total": 255,
    "unique": 4
  }
}
```

**Validation Rules**:
- All keys must be stringified numbers
- All values must be positive integers
- `stats.total` must equal sum of distribution values
- `stats.unique` must equal number of distribution keys

---

### 2. Dynamic Key Pattern

**Purpose**: Represents detected pattern of variable keys in a nested object

**TypeScript Interface**:

```typescript
/**
 * Pattern type for dynamic keys
 */
type DynamicKeyPattern =
  | 'UUID'
  | 'MONGODB_OBJECTID'
  | 'ULID'
  | 'NUMERIC_ID'
  | 'PREFIXED_ID'
  | 'CUSTOM';

/**
 * Detection confidence level
 */
type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Metadata about detected dynamic key pattern
 */
interface DynamicKeyMetadata {
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
```

**Example**:
```json
{
  "enabled": true,
  "pattern": "UUID",
  "confidence": 0.95,
  "confidenceLevel": "high",
  "countDistribution": {
    "10": 50,
    "15": 30,
    "20": 15,
    "25": 5
  },
  "countStats": {
    "min": 10,
    "max": 25,
    "median": 15,
    "p95": 20,
    "total": 100,
    "unique": 4
  },
  "documentsAnalyzed": 100,
  "uniqueKeysObserved": 1523,
  "exampleKeys": [
    "a0b1c2d3-e4f5-6789-abcd-ef0123456789",
    "b1c2d3e4-f5a6-789b-cdef-0123456789ab",
    "c2d3e4f5-a678-9bcd-ef01-23456789abcd"
  ]
}
```

**Validation Rules**:
- `confidence` must be between 0.0 and 1.0
- `confidenceLevel` derived from confidence: high (≥0.8), medium (≥0.6), low (<0.6)
- `pattern` must be 'CUSTOM' if `customPattern` is provided
- `exampleKeys` must contain valid keys matching the pattern
- `documentsAnalyzed` must be > 0
- `uniqueKeysObserved` must be ≥ detection threshold (default 50)

---

### 3. Dynamic Key Value Schema

**Purpose**: Describes the types and schemas of values associated with dynamic keys

**TypeScript Interface**:

```typescript
/**
 * Schema information for values associated with dynamic keys
 */
interface DynamicKeyValueSchema {
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
```

**Example (Mixed Types)**:
```json
{
  "types": ["string", "object", "null"],
  "typeProbabilities": [0.6, 0.35, 0.05],
  "schemas": [
    { "type": "string", "format": "email" },
    {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" }
      }
    },
    { "type": "null" }
  ],
  "isUniformType": false,
  "dominantType": "string"
}
```

**Example (Uniform Type)**:
```json
{
  "types": ["string"],
  "typeProbabilities": [1.0],
  "schemas": [
    { "type": "string", "minLength": 5, "maxLength": 50 }
  ],
  "isUniformType": true,
  "dominantType": "string"
}
```

**Validation Rules**:
- `types.length` must equal `typeProbabilities.length` and `schemas.length`
- `typeProbabilities` must sum to 1.0 (within 0.001 tolerance)
- Each probability must be > 0.0
- `dominantType` must be the type with highest probability
- `isUniformType` must be true only if `types.length === 1`

---

### 4. Array Length Stats

**Purpose**: Enhanced array length tracking with frequency distributions

**TypeScript Interface**:

```typescript
/**
 * Statistics about array lengths for a field path
 * Replaces exhaustive array storage with frequency distribution
 */
interface ArrayLengthStats {
  /** Field path (e.g., 'users.orders.items') */
  fieldPath: string;

  /** Distribution of array lengths */
  distribution: FrequencyDistribution;

  /** Statistical summary */
  stats: DistributionStats;

  /** Number of arrays analyzed */
  arraysAnalyzed: number;
}
```

**Example**:
```json
{
  "fieldPath": "users.addresses",
  "distribution": {
    "1": 450,
    "2": 350,
    "3": 150,
    "4": 40,
    "5": 10
  },
  "stats": {
    "min": 1,
    "max": 5,
    "median": 2,
    "p95": 3,
    "total": 1000,
    "unique": 5
  },
  "arraysAnalyzed": 1000
}
```

**Validation Rules**:
- `fieldPath` must be non-empty
- `stats.total` must equal `arraysAnalyzed`
- All distribution keys must be positive integers

---

### 5. Detection Configuration

**Purpose**: Configuration for dynamic key detection algorithm

**TypeScript Interface**:

```typescript
/**
 * Configuration for dynamic key detection
 */
interface DynamicKeyDetectionConfig {
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
```

**Default Configuration**:
```json
{
  "threshold": 50,
  "patterns": [
    {
      "name": "UUID",
      "regex": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    },
    {
      "name": "MONGODB_OBJECTID",
      "regex": "^[0-9a-f]{24}$"
    },
    {
      "name": "ULID",
      "regex": "^[0-9A-Z]{26}$"
    },
    {
      "name": "NUMERIC_ID",
      "regex": "^\\d{6,20}$"
    },
    {
      "name": "PREFIXED_ID",
      "regex": "^(user|doc|item|order)_[a-z0-9]{8,32}$"
    }
  ],
  "minPatternMatch": 0.8,
  "confidenceThreshold": 0.7,
  "forceStaticPaths": [],
  "forceDynamicPaths": []
}
```

**Validation Rules**:
- `threshold` must be ≥ 2
- `minPatternMatch` must be between 0.0 and 1.0
- `confidenceThreshold` must be between 0.0 and 1.0
- All regex patterns must be valid regular expressions
- Pattern names must be unique

---

## JSON Schema Extensions

### x-dynamic-keys Annotation

**Purpose**: Extend JSON Schema to represent dynamic key patterns

**Schema Property**:

```json
{
  "type": "object",
  "x-dynamic-keys": {
    "enabled": true,
    "metadata": { /* DynamicKeyMetadata */ },
    "valueSchema": { /* DynamicKeyValueSchema */ }
  }
}
```

**Complete Example**:
```json
{
  "type": "object",
  "title": "User Permissions by Resource ID",
  "x-dynamic-keys": {
    "enabled": true,
    "metadata": {
      "pattern": "UUID",
      "confidence": 0.95,
      "confidenceLevel": "high",
      "countDistribution": {
        "5": 40,
        "10": 35,
        "15": 20,
        "20": 5
      },
      "countStats": {
        "min": 5,
        "max": 20,
        "median": 10,
        "p95": 15,
        "total": 100,
        "unique": 4
      },
      "documentsAnalyzed": 100,
      "uniqueKeysObserved": 1234,
      "exampleKeys": [
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
      ]
    },
    "valueSchema": {
      "types": ["string"],
      "typeProbabilities": [1.0],
      "schemas": [
        {
          "type": "string",
          "enum": ["read", "write", "admin"]
        }
      ],
      "isUniformType": true,
      "dominantType": "string"
    }
  }
}
```

### x-array-length-distribution Annotation

**Purpose**: Extend JSON Schema to include array length frequency distributions

**Schema Property**:

```json
{
  "type": "array",
  "items": { /* item schema */ },
  "x-array-length-distribution": {
    "distribution": { /* FrequencyDistribution */ },
    "stats": { /* DistributionStats */ }
  }
}
```

**Complete Example**:
```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "street": { "type": "string" },
      "city": { "type": "string" }
    }
  },
  "x-array-length-distribution": {
    "distribution": {
      "1": 450,
      "2": 350,
      "3": 150,
      "4": 40,
      "5": 10
    },
    "stats": {
      "min": 1,
      "max": 5,
      "median": 2,
      "p95": 3,
      "total": 1000,
      "unique": 5
    }
  }
}
```

---

## Artifact Storage Format

### Updated constraints.json

**Current Format** (array lengths stored as arrays):
```json
{
  "arrayLengths": {
    "users.addresses": [1, 1, 2, 2, 2, 3, 1, 2, ...]  // ❌ Exhaustive
  }
}
```

**New Format** (frequency distributions):
```json
{
  "arrayLengths": {
    "users.addresses": {
      "distribution": {
        "1": 450,
        "2": 350,
        "3": 150,
        "4": 40,
        "5": 10
      },
      "stats": {
        "min": 1,
        "max": 5,
        "median": 2,
        "p95": 3,
        "total": 1000,
        "unique": 5
      }
    }
  }
}
```

### Updated generation.schema.json

**Objects with dynamic keys**:
```json
{
  "type": "object",
  "title": "Permissions by Resource",
  "x-dynamic-keys": {
    "enabled": true,
    "metadata": { /* ... */ },
    "valueSchema": { /* ... */ }
  }
}
```

**Arrays with length distributions**:
```json
{
  "type": "array",
  "items": { /* ... */ },
  "x-array-length-distribution": { /* ... */ }
}
```

---

## State Transitions

### Dynamic Key Detection Flow

```
1. Schema Inference (mongodb-schema)
   ↓
2. Extract object field keys
   ↓
3. Count unique keys per field path
   ↓
4. [Threshold Check] keys.length >= threshold?
   ├─ No → Standard object processing
   └─ Yes → Continue to pattern matching
       ↓
5. Apply regex patterns to keys
   ↓
6. Calculate match ratios
   ↓
7. [Pattern Match Check] maxMatch >= minPatternMatch?
   ├─ No → Standard object processing (log warning)
   └─ Yes → Continue to confidence scoring
       ↓
8. Compute confidence score
   ↓
9. [Confidence Check] confidence >= confidenceThreshold?
   ├─ No → Standard object processing (log warning)
   └─ Yes → Enable dynamic key treatment
       ↓
10. Generate DynamicKeyMetadata
    ↓
11. Analyze value types → DynamicKeyValueSchema
    ↓
12. Add x-dynamic-keys annotation to JSON Schema
```

### Array Length Processing Flow

```
1. Encounter array field during inference
   ↓
2. Collect all observed lengths
   ↓
3. Calculate frequency distribution
   ↓
4. Compute distribution stats
   ↓
5. Store ArrayLengthStats in constraints.json
   ↓
6. Add x-array-length-distribution to JSON Schema
```

---

## Relationships

### Entity Relationships

```
DynamicKeyMetadata
  ├── uses FrequencyDistribution (for countDistribution)
  ├── uses DistributionStats (for countStats)
  └── contains DynamicKeyValueSchema

DynamicKeyValueSchema
  └── contains JSON Schema[] (for each type)

ArrayLengthStats
  ├── uses FrequencyDistribution
  └── uses DistributionStats

DynamicKeyDetectionConfig
  └── defines thresholds and patterns for detection
```

### Processing Pipeline

```
MongoDB Collection
  ↓
[Sampler] → Sample Documents
  ↓
[Normalizer] → Normalized Documents
  ↓
[Inferencer] → Inferred Schema
  ↓
[Dynamic Key Detector] → DynamicKeyMetadata (if applicable)
  ↓
[Array Stats Profiler] → ArrayLengthStats
  ↓
[Synthesizer] → JSON Schema with x-dynamic-keys and x-array-length-distribution
  ↓
[Generator] → Synthetic Documents with dynamic keys and realistic array lengths
```

---

## Summary

This data model introduces:

1. **FrequencyDistribution**: Compact storage for value frequencies
2. **DynamicKeyMetadata**: Detection and pattern information for dynamic keys
3. **DynamicKeyValueSchema**: Type information for dynamic key values
4. **ArrayLengthStats**: Frequency-based array length tracking
5. **DynamicKeyDetectionConfig**: Configurable detection parameters

All entities are designed for JSON serialization with clear validation rules and relationships, enabling significant space savings and improved schema clarity.
