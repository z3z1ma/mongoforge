# Data Model: Synthetic MongoDB Document Generator

**Feature**: 001-mongodb-doc-gen
**Date**: 2025-12-26
**Status**: Complete

## Overview

This document defines the internal data structures used throughout the synthetic document generation pipeline. These structures flow between modules: sampling → normalization → inference → synthesis → generation → validation.

---

## Core Data Structures

### 1. SampleDocument

**Description**: A raw document retrieved from the source MongoDB collection during the discovery phase.

**Structure**:
```typescript
interface SampleDocument {
  _id: ObjectId | string | number;        // MongoDB document ID
  [key: string]: any;                     // Arbitrary nested fields
  __metadata: {                            // Internal metadata (not in source doc)
    collectionName: string;
    sampledAt: Date;
    sampleIndex: number;
  };
}
```

**Validation Rules**:
- Must have `_id` field (MongoDB requirement)
- Can contain any BSON types (ObjectId, Date, Decimal128, BinData, etc.)
- No schema enforcement (documents can be heterogeneous)

**State Transitions**:
- Retrieved from MongoDB → Passed to Normalizer → Transformed to NormalizedDocument

---

### 2. NormalizedDocument

**Description**: A sample document with MongoDB-extended types converted to JSON Schema-compatible representations.

**Structure**:
```typescript
interface TypeHint {
  originalType: string;                     // "ObjectId", "Date", "Decimal128", etc.
  jsonSchemaType: string;                   // "string", "number", etc.
  jsonSchemaFormat?: string;                // "objectid", "date-time", etc.
}

interface NormalizedDocument {
  _id: string;                              // Converted to string representation
  [key: string]: any;                       // Fields with normalized types
  __typeHints: Record<string, TypeHint>;    // Type mapping metadata
}
```

**Example**:
```javascript
// Original SampleDocument
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  createdAt: ISODate("2025-12-26T10:30:00Z"),
  balance: Decimal128("123.456789")
}

// NormalizedDocument
{
  _id: "507f1f77bcf86cd799439011",
  createdAt: "2025-12-26T10:30:00.000Z",
  balance: "123.456789",
  __typeHints: {
    "_id": { originalType: "ObjectId", jsonSchemaType: "string", jsonSchemaFormat: "objectid" },
    "createdAt": { originalType: "Date", jsonSchemaType: "string", jsonSchemaFormat: "date-time" },
    "balance": { originalType: "Decimal128", jsonSchemaType: "string", jsonSchemaFormat: "decimal" }
  }
}
```

**State Transitions**:
- Normalizer output → Passed to SchemaInferencer

---

### 3. InferredSchema

**Description**: The raw probabilistic schema extracted from normalized sample documents. Output of `mongodb-schema` library.

**Structure** (simplified representation of mongodb-schema output):
```javascript
{
  count: number,                           // Number of documents analyzed
  fields: {
    [fieldPath: string]: {
      name: string,                         // Field name
      path: string,                         // Full JSONPath (e.g., "user.addresses.city")
      count: number,                        // Number of docs where field appears
      type: string | string[],              // Type(s) observed: "String", "Number", "Array", "Document", etc.
      probability: number,                  // Presence rate (0.0 to 1.0)
      types: Array<{                        // Type distribution
        name: string,
        probability: number,
        unique?: number,
        values?: any[]
      }>,
      // For arrays:
      lengths?: number[],                   // Observed array lengths
      // For nested documents:
      fields?: { ... }                      // Recursive structure
    }
  }
}
```

**Example**:
```javascript
{
  count: 5000,
  fields: {
    "_id": {
      name: "_id",
      path: "_id",
      count: 5000,
      type: "String",
      probability: 1.0,
      types: [{ name: "String", probability: 1.0 }]
    },
    "tags": {
      name: "tags",
      path: "tags",
      count: 3500,
      type: "Array",
      probability: 0.7,
      lengths: [0, 1, 2, 3, 5, 10],  // Observed lengths
      types: [{ name: "String", probability: 1.0 }]
    }
  }
}
```

**State Transitions**:
- SchemaInferencer output → Passed to SchemaSynthesizer and ConstraintProfiler

---

### 4. ArrayLengthStats

**Description**: Statistical summary of array lengths for a specific array field path.

**Structure**:
```typescript
interface ArrayLengthStats {
  fieldPath: string;                       // e.g., "user.orders"
  observedLengths: number[];               // All observed lengths
  minLen: number;
  maxLen: number;
  p50Len: number;                          // Median
  p90Len: number;
  p99Len: number;
  mean: number;
  stdDev: number;
}
```

**Validation Rules**:
- `minLen <= p50Len <= p90Len <= p99Len <= maxLen`
- All percentile values must be integers >= 0

**Example**:
```javascript
{
  fieldPath: "user.orders",
  observedLengths: [0, 1, 2, 2, 3, 5, 10, 15, 20, 100],
  minLen: 0,
  maxLen: 100,
  p50Len: 3,
  p90Len: 20,
  p99Len: 100,
  mean: 15.8,
  stdDev: 28.4
}
```

---

### 5. DocumentSizeBucket

**Description**: Document size classification bucket for size distribution matching.

**Structure**:
```typescript
type SizeProxyType = "leafFieldCount" | "arrayLengthSum" | "byteSize";

interface DocumentSizeBucket {
  bucketId: string;                        // e.g., "small", "medium", "large"
  sizeRange: {
    min: number;                            // Minimum size proxy value
    max: number;                            // Maximum size proxy value
  };
  sizeProxy: SizeProxyType;
  count: number;                            // Number of sample docs in this bucket
  probability: number;                      // Proportion of samples (0.0 to 1.0)
}
```

**Example**:
```javascript
{
  bucketId: "medium",
  sizeRange: { min: 20, max: 50 },
  sizeProxy: "leafFieldCount",
  count: 3200,
  probability: 0.64
}
```

---

### 6. ConstraintsProfile

**Description**: Statistical constraints extracted from sample documents. Guides generation to match sample characteristics.

**Structure**:
```typescript
type KeyFieldType = "ObjectId" | "string" | "number" | "UUID";
type IdPolicy = "objectid" | "uuid" | "string" | "number" | "inferred";
type UniquenessScope = "batch" | "run";
type ArrayLenPolicy = "minmax" | "percentileClamp";

interface KeyFieldConfig {
  type: KeyFieldType;
  policy: IdPolicy;
  enforceUniqueness: boolean;
  uniquenessScope: UniquenessScope;
}

interface AdditionalKeyConfig {
  fieldPath: string;
  type: string;
  enforceUniqueness: boolean;
  uniquenessScope: UniquenessScope;
}

interface ConstraintsProfile {
  arrayStats: Map<string, ArrayLengthStats>;  // Key: field path
  sizeBuckets: DocumentSizeBucket[];
  keyFields: {
    _id: KeyFieldConfig;
    additionalKeys: AdditionalKeyConfig[];
  };
  config: {
    arrayLenPolicy: ArrayLenPolicy;
    percentiles: number[];                   // e.g., [50, 90, 99]
    clampRange: [number, number];            // e.g., [1, 99] for p1-p99
  };
}
```

**Example**:
```javascript
{
  arrayStats: new Map([
    ["tags", { fieldPath: "tags", minLen: 0, maxLen: 10, p50Len: 3, p90Len: 7, p99Len: 10 }],
    ["user.orders", { fieldPath: "user.orders", minLen: 0, maxLen: 100, p50Len: 5, p90Len: 20, p99Len: 50 }]
  ]),
  sizeBuckets: [
    { bucketId: "small", sizeRange: { min: 0, max: 20 }, sizeProxy: "leafFieldCount", count: 1000, probability: 0.2 },
    { bucketId: "medium", sizeRange: { min: 20, max: 50 }, sizeProxy: "leafFieldCount", count: 3200, probability: 0.64 },
    { bucketId: "large", sizeRange: { min: 50, max: 200 }, sizeProxy: "leafFieldCount", count: 800, probability: 0.16 }
  ],
  keyFields: {
    _id: { type: "ObjectId", policy: "objectid", enforceUniqueness: true, uniquenessScope: "run" },
    additionalKeys: []
  },
  config: {
    arrayLenPolicy: "percentileClamp",
    percentiles: [50, 90, 99],
    clampRange: [1, 99]
  }
}
```

**State Transitions**:
- ConstraintProfiler output → Serialized to `constraints.json` → Used by Generator

---

### 7. GenerationSchema (GS)

**Description**: JSON Schema draft-07 document with vendor extensions (x-gen keywords) defining structure and constraints for synthetic document generation.

**Structure** (JSON Schema draft-07 with custom extensions):
```javascript
{
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  title: string,                            // e.g., "SyntheticUserDocument"
  properties: {
    [fieldName: string]: {
      type: string | string[],               // JSON Schema type(s)
      format?: string,                       // JSON Schema format (date-time, objectid, etc.)
      // For arrays:
      items?: { ... },                       // Array element schema
      minItems?: number,                     // From ConstraintsProfile
      maxItems?: number,
      // For objects:
      properties?: { ... },
      required?: string[],
      // Custom vendor extensions:
      "x-gen"?: {
        key?: boolean,                        // Field is key-like (uniqueness preferred)
        mongoType?: string,                   // Original MongoDB type
        arrayLen?: {
          min: number,
          max: number,
          p50: number,
          p90: number,
          p99: number,
          strategy: "minmax" | "percentile"
        },
        sizeWeight?: number                   // Weight for size proxy calculation
      }
    }
  },
  required: string[],                        // Always includes "_id" + user-configured keys
  additionalProperties: boolean              // Default: true (allow extra fields)
}
```

**Example**:
```javascript
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "SyntheticUserDocument",
  "properties": {
    "_id": {
      "type": "string",
      "format": "objectid",
      "x-gen": {
        "key": true,
        "mongoType": "ObjectId"
      }
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "x-gen": {
        "mongoType": "Date"
      }
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 10,
      "x-gen": {
        "arrayLen": {
          "min": 0,
          "max": 10,
          "p50": 3,
          "p90": 7,
          "p99": 10,
          "strategy": "percentile"
        }
      }
    }
  },
  "required": ["_id"],
  "additionalProperties": true
}
```

**Validation Rules**:
- Must be valid JSON Schema draft-07
- `required` array must include `_id`
- All `x-gen` extensions are optional but must follow defined structure
- Array schemas with `x-gen.arrayLen` must have `minItems` and `maxItems` set

**State Transitions**:
- SchemaSynthesizer output → Serialized to `generation.schema.json` → Used by Generator and Validator

---

### 8. SyntheticDocument

**Description**: A generated document conforming to the GenerationSchema and ConstraintsProfile.

**Structure**:
```javascript
{
  _id: string | number,                     // Generated key (type depends on policy)
  ...fields: any,                           // Generated fields per schema
  __generationMeta?: {                      // Optional metadata (stripped before output)
    seed: string | number,
    generatedAt: Date,
    schemaVersion: string,
    sizeBucket: string
  }
}
```

**Validation Rules**:
- Must conform to GenerationSchema (validated by Ajv)
- Array lengths must fall within configured constraints
- Key fields (_id, additionalKeys) must be unique if enforceUniqueness is true
- MongoDB types must be valid (e.g., ObjectId is 24-char hex string)

**State Transitions**:
- Generator output → Passed to Emitter (NDJSON writer or MongoDB inserter) → Optionally validated by Validator

---

### 9. RunManifest

**Description**: Machine-readable artifact documenting a generation run for auditability and reproducibility.

**Structure**:
```javascript
{
  version: string,                          // Manifest schema version (e.g., "1.0.0")
  tool: {
    name: "mongoforge",
    version: string                          // Tool version (from package.json)
  },
  run: {
    id: string,                             // Unique run ID (UUID v4)
    timestamp: string,                       // ISO 8601 timestamp
    phase: "discovery" | "generation" | "validation"
  },
  config: {
    source?: {
      uri: string,                          // MongoDB URI (sanitized, no credentials)
      database: string,
      collection: string,
      sampleSize: number,
      samplingStrategy: string
    },
    generation?: {
      docCount: number,
      seed: string | number,
      schemaHash: string,                   // SHA-256 hash of GenerationSchema
      constraintsHash: string               // SHA-256 hash of ConstraintsProfile
    },
    output?: {
      format: "ndjson" | "json",
      destination: string                   // File path or "stdout" or "mongodb://"
    }
  },
  artifacts: {
    inferredSchema?: {
      path: string,
      hash: string                          // SHA-256 hash
    },
    generationSchema?: {
      path: string,
      hash: string
    },
    constraints?: {
      path: string,
      hash: string
    },
    output?: {
      path: string,
      hash?: string,                        // Optional (for NDJSON files)
      size?: number                         // File size in bytes
    }
  },
  metrics?: {
    duration: number,                       // Run duration in milliseconds
    documentsProcessed: number,
    throughput?: number,                    // Docs/second
    memoryPeak?: number                     // Peak memory usage in MB
  }
}
```

**Example**:
```javascript
{
  "version": "1.0.0",
  "tool": {
    "name": "mongoforge",
    "version": "0.1.0"
  },
  "run": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-12-26T10:30:00.000Z",
    "phase": "generation"
  },
  "config": {
    "generation": {
      "docCount": 100000,
      "seed": "test-seed-123",
      "schemaHash": "a3f5e8c9...",
      "constraintsHash": "b2d4f7a1..."
    },
    "output": {
      "format": "ndjson",
      "destination": "./output/synthetic-users.ndjson"
    }
  },
  "artifacts": {
    "generationSchema": {
      "path": "./schemas/generation.schema.json",
      "hash": "a3f5e8c9..."
    },
    "constraints": {
      "path": "./schemas/constraints.json",
      "hash": "b2d4f7a1..."
    },
    "output": {
      "path": "./output/synthetic-users.ndjson",
      "hash": "c1e9d3b5...",
      "size": 52428800
    }
  },
  "metrics": {
    "duration": 12500,
    "documentsProcessed": 100000,
    "throughput": 8000,
    "memoryPeak": 512
  }
}
```

**State Transitions**:
- Reporter module generates manifest → Serialized to `manifest.json` → Archived with artifacts

---

### 10. ValidationReport

**Description**: Quality report comparing generated documents against schema and sample characteristics.

**Structure**:
```javascript
{
  schemaConformance: {
    totalDocuments: number,
    validDocuments: number,
    invalidDocuments: number,
    conformanceRate: number,                // 0.0 to 1.0
    violations: Array<{
      documentIndex: number,
      errors: Array<{
        path: string,
        message: string
      }>
    }>
  },
  arrayLengthComparison: {
    [fieldPath: string]: {
      sample: {
        minLen: number,
        maxLen: number,
        p50Len: number,
        p90Len: number,
        p99Len: number
      },
      generated: {
        minLen: number,
        maxLen: number,
        p50Len: number,
        p90Len: number,
        p99Len: number
      },
      deviation: {
        p50: number,                        // Percentage deviation
        p90: number,
        p99: number
      },
      passed: boolean                       // Within 10% tolerance
    }
  },
  documentSizeComparison: {
    buckets: Array<{
      bucketId: string,
      sample: {
        count: number,
        probability: number
      },
      generated: {
        count: number,
        probability: number
      },
      deviation: number,                    // Percentage deviation
      passed: boolean                       // Within 20% tolerance
    }>
  },
  keyUniqueness: {
    _id: {
      totalKeys: number,
      uniqueKeys: number,
      duplicates: number,
      passed: boolean                       // 100% uniqueness required
    },
    additionalKeys: Map<string, {
      totalKeys: number,
      uniqueKeys: number,
      duplicates: number,
      passed: boolean
    }>
  }
}
```

**Example**:
```javascript
{
  "schemaConformance": {
    "totalDocuments": 10000,
    "validDocuments": 10000,
    "invalidDocuments": 0,
    "conformanceRate": 1.0,
    "violations": []
  },
  "arrayLengthComparison": {
    "tags": {
      "sample": { "minLen": 0, "maxLen": 10, "p50Len": 3, "p90Len": 7, "p99Len": 10 },
      "generated": { "minLen": 1, "maxLen": 10, "p50Len": 3, "p90Len": 7, "p99Len": 10 },
      "deviation": { "p50": 0, "p90": 0, "p99": 0 },
      "passed": true
    }
  },
  "documentSizeComparison": {
    "buckets": [
      {
        "bucketId": "medium",
        "sample": { "count": 3200, "probability": 0.64 },
        "generated": { "count": 6300, "probability": 0.63 },
        "deviation": 1.56,
        "passed": true
      }
    ]
  },
  "keyUniqueness": {
    "_id": {
      "totalKeys": 10000,
      "uniqueKeys": 10000,
      "duplicates": 0,
      "passed": true
    }
  }
}
```

**State Transitions**:
- Validator output → Serialized to `validation-report.json` or output to stdout

---

## Data Flow Diagram

```text
MongoDB Collection
      ↓
  [Sampler]
      ↓
  SampleDocument[]
      ↓
  [Normalizer]
      ↓
  NormalizedDocument[] + TypeHints
      ↓
  [SchemaInferencer]
      ↓
  InferredSchema
      ↓
      ├──→ [SchemaSynthesizer] → GenerationSchema (JSON file)
      └──→ [ConstraintProfiler] → ConstraintsProfile (JSON file)
            ↓
        [Generator] (uses GenerationSchema + ConstraintsProfile)
            ↓
        SyntheticDocument[] (stream)
            ↓
            ├──→ [Emitter] → NDJSON file or MongoDB
            └──→ [Validator] → ValidationReport (JSON file)
            ↓
        [Reporter] → RunManifest (JSON file)
```

---

## File Serialization Formats

| Data Structure        | File Name                  | Format | Location                    |
|-----------------------|----------------------------|--------|-----------------------------|
| InferredSchema        | inferred.schema.json       | JSON   | Output directory            |
| GenerationSchema      | generation.schema.json     | JSON   | Output directory            |
| ConstraintsProfile    | constraints.json           | JSON   | Output directory            |
| SyntheticDocument[]   | synthetic-{collection}.ndjson | NDJSON | Output directory or stdout  |
| RunManifest           | manifest-{runId}.json      | JSON   | Output directory            |
| ValidationReport      | validation-report.json     | JSON   | Output directory or stdout  |

---

## Next Steps (Phase 1 Continuation)

With data model defined, proceed to:
1. **contracts/**: Define CLI command input/output contracts
2. **quickstart.md**: Create user-facing getting-started guide

---

**Data Model Sign-off**: All internal data structures defined with validation rules and state transitions. Ready for contract definition.
