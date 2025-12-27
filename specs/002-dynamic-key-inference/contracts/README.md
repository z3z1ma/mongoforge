# API Contracts: Dynamic Key Inference & Optimized Array Length Storage

This directory contains JSON Schema definitions for the data structures introduced by the dynamic key inference feature.

## Schema Files

### `dynamic-key-metadata.schema.json`
Defines the metadata structure for detected dynamic key patterns.

**Used in**:
- `generation.schema.json` artifacts (as `x-dynamic-keys.metadata`)
- Inferencer output

**Key properties**:
- `pattern`: Detected pattern type (UUID, ObjectId, etc.)
- `confidence`: Detection confidence score
- `countDistribution`: Frequency map of key counts
- `exampleKeys`: Sample keys for validation

### `dynamic-key-value-schema.schema.json`
Defines the schema for values associated with dynamic keys.

**Used in**:
- `generation.schema.json` artifacts (as `x-dynamic-keys.valueSchema`)
- Generator pre-processing

**Key properties**:
- `types`: Array of observed value types
- `typeProbabilities`: Probability distribution over types
- `schemas`: JSON Schema for each type variant
- `dominantType`: Most common value type

### `array-length-stats.schema.json`
Defines the frequency distribution structure for array lengths.

**Used in**:
- `constraints.json` artifacts (replaces exhaustive array storage)
- `generation.schema.json` artifacts (as `x-array-length-distribution`)

**Key properties**:
- `fieldPath`: Array field path in dot notation
- `distribution`: Frequency map (length → count)
- `stats`: Min/max/median/p95 statistics
- `arraysAnalyzed`: Total arrays sampled

### `detection-config.schema.json`
Defines configuration options for dynamic key detection.

**Used in**:
- CLI configuration (`--config` file)
- Programmatic API options

**Key properties**:
- `threshold`: Unique key count threshold (default: 50)
- `patterns`: Regex patterns for key format detection
- `minPatternMatch`: Minimum pattern match ratio
- `forceStaticPaths` / `forceDynamicPaths`: Manual overrides

## Usage Examples

### Dynamic Key Metadata in JSON Schema

```json
{
  "type": "object",
  "title": "User Permissions",
  "x-dynamic-keys": {
    "enabled": true,
    "metadata": {
      "pattern": "UUID",
      "confidence": 0.95,
      "confidenceLevel": "high",
      "countDistribution": {
        "10": 50,
        "15": 30,
        "20": 20
      },
      "countStats": {
        "min": 10,
        "max": 20,
        "median": 15,
        "p95": 18,
        "total": 100,
        "unique": 3
      },
      "documentsAnalyzed": 100,
      "uniqueKeysObserved": 1523,
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

### Array Length Distribution in JSON Schema

```json
{
  "type": "array",
  "items": {
    "type": "string"
  },
  "x-array-length-distribution": {
    "distribution": {
      "1": 450,
      "2": 350,
      "3": 150,
      "5": 40,
      "10": 10
    },
    "stats": {
      "min": 1,
      "max": 10,
      "median": 2,
      "p95": 5,
      "total": 1000,
      "unique": 5
    }
  }
}
```

### Detection Configuration (config file)

```json
{
  "dynamicKeyDetection": {
    "threshold": 50,
    "patterns": [
      {
        "name": "UUID",
        "regex": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
      },
      {
        "name": "CUSTOM_TRANSACTION_ID",
        "regex": "^TXN_[0-9]{10}$"
      }
    ],
    "minPatternMatch": 0.8,
    "confidenceThreshold": 0.7,
    "forceStaticPaths": ["users.metadata"],
    "forceDynamicPaths": ["events.byResourceId"]
  }
}
```

## Validation

All schemas can be validated using standard JSON Schema validators:

```bash
# Using ajv-cli
ajv validate -s dynamic-key-metadata.schema.json -d example-data.json
```

## Integration with mongoforge

These schemas define the contract between:
1. **Inferencer** → Synthesizer (dynamic key metadata)
2. **Profiler** → Constraints artifact (frequency distributions)
3. **Synthesizer** → JSON Schema artifact (x-* annotations)
4. **Generator** → Synthetic documents (pattern-based generation)

See `data-model.md` for complete type definitions and relationships.
