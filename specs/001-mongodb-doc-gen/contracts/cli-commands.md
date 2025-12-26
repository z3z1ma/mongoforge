# CLI Command Contracts

**Feature**: 001-mongodb-doc-gen
**Date**: 2025-12-26
**Status**: Complete

## Overview

This document defines the input/output contracts for all CLI commands in the `mongoforge` tool. Each command follows the text I/O protocol: arguments/stdin → stdout (success) or stderr (errors), with appropriate exit codes.

---

## Global Options

Available for all commands:

```bash
--config <path>         # Path to configuration file (JSON/YAML)
--log-level <level>     # Logging verbosity: error, warn, info, debug (default: info)
--help                  # Show help for command
--version               # Show tool version
```

**Exit Codes**:
- `0`: Success
- `1`: General error (validation failure, runtime error)
- `2`: Configuration error (invalid config file, missing required options)
- `3`: MongoDB connection error
- `4`: File I/O error

---

## Command: `mongoforge infer`

### Purpose

Sample a MongoDB collection, infer schema, and produce discovery artifacts (inferred.schema.json, generation.schema.json, constraints.json).

### Usage

```bash
mongoforge infer [options]
```

### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--source-uri` | string | Yes* | - | MongoDB connection URI |
| `--source-db` | string | Yes* | - | Source database name |
| `--source-collection` | string | Yes* | - | Source collection name |
| `--sample-size` | number | No | 10000 | Number of documents to sample |
| `--sampling-strategy` | enum | No | `random` | Sampling strategy: `random`, `first-n`, `time-windowed` |
| `--time-field` | string | No | - | Field for time-windowed sampling (required if strategy is `time-windowed`) |
| `--output-dir` | string | No | `./output` | Directory for output artifacts |
| `--array-len-policy` | enum | No | `percentileClamp` | Array length policy: `minmax`, `percentileClamp` |
| `--percentiles` | array | No | `[50,90,99]` | Percentiles to track (comma-separated) |
| `--clamp-range` | array | No | `[1,99]` | Percentile clamping range `[p-low, p-high]` |
| `--id-policy` | enum | No | `inferred` | ID policy: `objectid`, `uuid`, `string`, `number`, `inferred` |
| `--key-fields` | array | No | `[]` | Additional key fields (comma-separated) |
| `--enforce-unique-keys` | boolean | No | `false` | Enforce uniqueness for key fields |
| `--uniqueness-scope` | enum | No | `run` | Uniqueness scope: `batch`, `run` |

\* Required unless provided via `--config`

### Input

None (command-line arguments only)

### Output (stdout)

**Success**: JSON manifest with artifact paths

```json
{
  "status": "success",
  "phase": "discovery",
  "artifacts": {
    "inferredSchema": "./output/inferred.schema.json",
    "generationSchema": "./output/generation.schema.json",
    "constraints": "./output/constraints.json"
  },
  "summary": {
    "sampledDocuments": 10000,
    "fieldsInferred": 45,
    "arrayPathsTracked": 8,
    "durationMs": 3200
  }
}
```

**Error** (stderr): JSON error object

```json
{
  "status": "error",
  "phase": "discovery",
  "error": {
    "code": "MONGO_CONNECTION_ERROR",
    "message": "Failed to connect to MongoDB at mongodb://localhost:27017",
    "details": "Connection timeout after 30s"
  }
}
```

### Exit Codes

- `0`: Success (artifacts written)
- `2`: Invalid configuration (missing required options, invalid strategy)
- `3`: MongoDB connection error
- `4`: File I/O error (cannot write artifacts)

### Side Effects

- Creates output directory if it doesn't exist
- Writes 3 JSON files: `inferred.schema.json`, `generation.schema.json`, `constraints.json`
- Reads from MongoDB collection (read-only, no writes)

### Example

```bash
# Basic usage
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db production \
  --source-collection users \
  --sample-size 5000 \
  --output-dir ./schemas

# With configuration file
mongoforge infer --config ./config.yaml

# With custom key fields
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db production \
  --source-collection users \
  --key-fields accountId,tenantId \
  --enforce-unique-keys
```

---

## Command: `mongoforge generate`

### Purpose

Generate synthetic documents based on generation schema and constraints.

### Usage

```bash
mongoforge generate [options]
```

### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--generation-schema` | string | Yes* | - | Path to generation.schema.json |
| `--constraints` | string | Yes* | - | Path to constraints.json |
| `--doc-count` | number | Yes* | - | Number of synthetic documents to generate |
| `--seed` | string/number | No | - | Seed for deterministic generation (PRNG) |
| `--output-format` | enum | No | `ndjson` | Output format: `ndjson`, `json` |
| `--output-path` | string | No | `stdout` | Output path (or `stdout`) |
| `--split-files-by` | enum | No | - | Split output: `size` (bytes), `count` (docs) |
| `--split-size` | number | No | - | Size/count threshold for splitting (required if `--split-files-by` set) |
| `--target-uri` | string | No | - | MongoDB URI for direct insertion |
| `--target-db` | string | No | - | Target database (required if `--target-uri` set) |
| `--target-collection` | string | No | - | Target collection (required if `--target-uri` set) |
| `--collection-suffix` | string | No | - | Suffix for target collection name (e.g., `_synthetic`) |
| `--batch-size` | number | No | 1000 | Batch size for MongoDB bulk inserts |
| `--write-concern` | string | No | `majority` | Write concern for MongoDB inserts |
| `--ordered-inserts` | boolean | No | `false` | Use ordered bulk inserts |
| `--custom-generators` | string | No | - | Path to custom generator module (JS file) |

\* Required unless provided via `--config`

### Input (stdin)

Optional: JSON array of custom generator overrides (if `--custom-generators` not used)

```json
[
  {
    "fieldPath": "customer.email",
    "generator": "email"
  },
  {
    "fieldPath": "_id",
    "generator": "objectid",
    "options": { "timestampPrefix": "2025-01-01" }
  }
]
```

### Output (stdout)

**File output mode** (`--output-path` is file):

```json
{
  "status": "success",
  "phase": "generation",
  "output": {
    "format": "ndjson",
    "files": [
      "./output/synthetic-users.ndjson"
    ],
    "totalDocuments": 100000,
    "totalSize": 52428800
  },
  "manifest": "./output/manifest-550e8400.json",
  "metrics": {
    "durationMs": 12500,
    "throughput": 8000,
    "memoryPeakMb": 512
  }
}
```

**Stdout output mode** (`--output-path stdout`):

Streams NDJSON documents directly to stdout (one JSON object per line, no wrapper):

```
{"_id":"507f1f77bcf86cd799439011","name":"John Doe",...}
{"_id":"507f1f77bcf86cd799439012","name":"Jane Smith",...}
...
```

**MongoDB insertion mode** (`--target-uri` set):

```json
{
  "status": "success",
  "phase": "generation",
  "output": {
    "destination": "mongodb://localhost:27017/test/users_synthetic",
    "totalDocuments": 100000,
    "insertedDocuments": 100000,
    "failedInserts": 0
  },
  "manifest": "./output/manifest-550e8400.json",
  "metrics": {
    "durationMs": 18500,
    "throughput": 5405,
    "memoryPeakMb": 768
  }
}
```

**Error** (stderr):

```json
{
  "status": "error",
  "phase": "generation",
  "error": {
    "code": "SCHEMA_LOAD_ERROR",
    "message": "Cannot load generation schema from ./schemas/generation.schema.json",
    "details": "File not found"
  }
}
```

### Exit Codes

- `0`: Success (documents generated)
- `2`: Invalid configuration (missing schema/constraints, invalid seed)
- `3`: MongoDB connection error (if using direct insertion)
- `4`: File I/O error (cannot read schema or write output)

### Side Effects

- Reads generation schema and constraints files
- Writes NDJSON/JSON file(s) OR inserts documents into MongoDB
- Writes run manifest JSON file
- If `--target-uri` set: writes to MongoDB collection (creates collection if it doesn't exist)

### Example

```bash
# Generate to NDJSON file
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --seed "test-seed-123" \
  --output-path ./output/synthetic-users.ndjson

# Generate to stdout (pipe to other tools)
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 1000 \
  --output-path stdout | mongoimport --db test --collection users

# Direct MongoDB insertion
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --target-uri mongodb://localhost:27017 \
  --target-db test \
  --target-collection users \
  --collection-suffix _synthetic \
  --batch-size 500

# With custom generators
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 10000 \
  --custom-generators ./generators/custom.js \
  --output-path ./output/synthetic-users.ndjson
```

---

## Command: `mongoforge validate`

### Purpose

Validate generated documents against schema and constraints, produce quality report.

### Usage

```bash
mongoforge validate [options]
```

### Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--generation-schema` | string | Yes* | - | Path to generation.schema.json |
| `--constraints` | string | Yes* | - | Path to constraints.json |
| `--input-path` | string | Yes* | - | Path to NDJSON file to validate (or `stdin`) |
| `--sample-path` | string | No | - | Path to sample documents NDJSON (for comparison) |
| `--output-path` | string | No | `stdout` | Path for validation report JSON (or `stdout`) |
| `--tolerance-array-len` | number | No | 10 | Percentage tolerance for array length deviations |
| `--tolerance-doc-size` | number | No | 20 | Percentage tolerance for document size deviations |

\* Required unless provided via `--config`

### Input (stdin)

If `--input-path stdin`, expects NDJSON stream of synthetic documents:

```
{"_id":"507f1f77bcf86cd799439011","name":"John Doe",...}
{"_id":"507f1f77bcf86cd799439012","name":"Jane Smith",...}
...
```

### Output (stdout)

**Success**: JSON validation report

```json
{
  "status": "success",
  "phase": "validation",
  "report": {
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
    },
    "overallPassed": true
  }
}
```

**Error** (stderr):

```json
{
  "status": "error",
  "phase": "validation",
  "error": {
    "code": "INPUT_READ_ERROR",
    "message": "Cannot read input documents from ./output/synthetic-users.ndjson",
    "details": "File not found"
  }
}
```

### Exit Codes

- `0`: Success (validation passed)
- `1`: Validation failed (schema violations, constraint violations)
- `2`: Invalid configuration
- `4`: File I/O error

### Side Effects

- Reads generation schema, constraints, and input documents
- Optionally reads sample documents for comparison
- Writes validation report JSON (to file or stdout)

### Example

```bash
# Validate NDJSON file
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson \
  --output-path ./output/validation-report.json

# Validate from stdin
cat ./output/synthetic-users.ndjson | mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path stdin

# With sample comparison
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson \
  --sample-path ./samples/real-users.ndjson \
  --tolerance-array-len 5 \
  --tolerance-doc-size 15
```

---

## Combined Workflow Example

```bash
# Step 1: Infer schema from production collection
mongoforge infer \
  --source-uri mongodb://prod-host:27017 \
  --source-db myapp \
  --source-collection users \
  --sample-size 10000 \
  --output-dir ./schemas

# Step 2: Generate 100k synthetic documents
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --seed "cdc-test-2025-12-26" \
  --output-path ./output/synthetic-users.ndjson

# Step 3: Validate generated documents
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson \
  --output-path ./output/validation-report.json

# Step 4 (optional): Insert into test database
mongoimport --uri mongodb://test-host:27017 \
  --db myapp_test \
  --collection users_synthetic \
  --file ./output/synthetic-users.ndjson
```

---

## Configuration File Format

### YAML Example

```yaml
# mongoforge.config.yaml

# Infer command configuration
infer:
  source:
    uri: mongodb://localhost:27017
    database: production
    collection: users
  sampling:
    sampleSize: 10000
    strategy: random
  constraints:
    arrayLenPolicy: percentileClamp
    percentiles: [50, 90, 99]
    clampRange: [1, 99]
  keys:
    idPolicy: inferred
    keyFields: []
    enforceUniqueKeys: false
  output:
    dir: ./schemas

# Generate command configuration
generate:
  generationSchema: ./schemas/generation.schema.json
  constraints: ./schemas/constraints.json
  docCount: 100000
  seed: "test-seed-123"
  output:
    format: ndjson
    path: ./output/synthetic-users.ndjson
  # Optional: direct MongoDB insertion
  # target:
  #   uri: mongodb://localhost:27017
  #   database: test
  #   collection: users
  #   collectionSuffix: _synthetic
  #   batchSize: 1000
  #   writeConcern: majority
  #   orderedInserts: false

# Validate command configuration
validate:
  generationSchema: ./schemas/generation.schema.json
  constraints: ./schemas/constraints.json
  inputPath: ./output/synthetic-users.ndjson
  outputPath: ./output/validation-report.json
  tolerances:
    arrayLen: 10
    docSize: 20
```

### JSON Example

```json
{
  "infer": {
    "source": {
      "uri": "mongodb://localhost:27017",
      "database": "production",
      "collection": "users"
    },
    "sampling": {
      "sampleSize": 10000,
      "strategy": "random"
    },
    "output": {
      "dir": "./schemas"
    }
  },
  "generate": {
    "generationSchema": "./schemas/generation.schema.json",
    "constraints": "./schemas/constraints.json",
    "docCount": 100000,
    "seed": "test-seed-123",
    "output": {
      "format": "ndjson",
      "path": "./output/synthetic-users.ndjson"
    }
  },
  "validate": {
    "generationSchema": "./schemas/generation.schema.json",
    "constraints": "./schemas/constraints.json",
    "inputPath": "./output/synthetic-users.ndjson",
    "outputPath": "./output/validation-report.json"
  }
}
```

---

## Error Codes Reference

| Code | Exit Code | Description |
|------|-----------|-------------|
| `SUCCESS` | 0 | Command completed successfully |
| `GENERAL_ERROR` | 1 | Unspecified error or validation failure |
| `CONFIG_ERROR` | 2 | Invalid configuration (missing options, invalid values) |
| `MONGO_CONNECTION_ERROR` | 3 | MongoDB connection/authentication failure |
| `FILE_IO_ERROR` | 4 | File read/write error |
| `SCHEMA_LOAD_ERROR` | 4 | Cannot load schema or constraints file |
| `SCHEMA_INVALID` | 2 | Schema file is not valid JSON Schema draft-07 |
| `VALIDATION_FAILED` | 1 | Generated documents failed validation |
| `INSUFFICIENT_SAMPLES` | 1 | Sample size too small (<100 documents) |
| `CUSTOM_GENERATOR_ERROR` | 2 | Custom generator module failed to load |

---

**Contracts Sign-off**: All CLI command input/output contracts defined with examples. Ready for quickstart documentation.
