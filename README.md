# MongoForge

Schema-driven synthetic MongoDB document generation for high-volume CDC and load testing.

## Overview

MongoForge generates high-volume synthetic MongoDB documents that preserve structural fidelity (nested objects, array sizes, document shapes) without semantic fidelity. Perfect for load testing and CDC validation without exposing production data.

**Key Features**:
- Generate millions of test documents without exposing production data
- Preserve document size and array length distributions for realistic load testing
- Reproducible generation with seed control (byte-identical output)
- High throughput (10,000+ docs/second)
- MongoDB 4.0+ compatible

## Installation

```bash
npm install -g mongoforge
```

## Quick Start

### 1. Infer Schema from MongoDB Collection

```bash
mongoforge infer \
  --source-uri mongodb://localhost:27017 \
  --source-db production \
  --source-collection users \
  --sample-size 10000 \
  --output-dir ./schemas
```

### 2. Generate Synthetic Documents

```bash
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --seed "test-seed-123" \
  --output-path ./output/synthetic-users.ndjson
```

### 3. Validate Generated Documents

```bash
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson
```

## Advanced Usage

### Direct MongoDB Insertion

Skip NDJSON files and insert directly into MongoDB:

```bash
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --target-uri mongodb://localhost:27017 \
  --target-db test \
  --target-collection users_synthetic \
  --batch-size 1000
```

### Configuration Files

Use YAML/JSON config files to avoid repetitive flags:

```yaml
# mongoforge.config.yaml
infer:
  source:
    uri: mongodb://localhost:27017
    database: production
    collection: users
  sampling:
    sampleSize: 10000
  output:
    dir: ./schemas

generate:
  generationSchema: ./schemas/generation.schema.json
  constraints: ./schemas/constraints.json
  docCount: 100000
  seed: "test-seed-123"
  output:
    path: ./output/synthetic-users.ndjson
```

Then run:

```bash
mongoforge infer --config mongoforge.config.yaml
mongoforge generate --config mongoforge.config.yaml
```

### Custom Field Generators

Override default generation for specific fields:

```javascript
// custom-generators.js
export default {
  // Path-specific generators
  'user.email': () => `user${Math.random()}@example.com`,
  'user.accountId': () => `ACC-${Date.now()}-${Math.random()}`,

  // Type-level generators
  objectId: () => new ObjectId(),
  date: () => new Date().toISOString()
};
```

```bash
mongoforge generate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --doc-count 100000 \
  --custom-generators ./custom-generators.js
```

## MongoDB Type Mappings

MongoForge normalizes MongoDB-specific types to JSON Schema-compatible formats during inference, then restores them during generation:

| MongoDB Type | Normalized (JSON Schema) | Generated Format | Example |
|--------------|--------------------------|------------------|---------|
| `ObjectId` | `string` with `format: "objectid"` | BSON ObjectId | `ObjectId("507f1f77bcf86cd799439011")` |
| `Date` | `string` with `format: "date-time"` | ISO 8601 string → BSON Date | `ISODate("2023-12-26T10:30:00.000Z")` |
| `Decimal128` | `string` with `x-gen.mongoType: "decimal128"` | BSON Decimal128 | `NumberDecimal("123.45")` |
| `BinData` | `string` with `x-gen.mongoType: "bindata"` | Base64 string → BSON Binary | `BinData(0, "SGVsbG8=")` |
| `Timestamp` | `integer` with `x-gen.mongoType: "timestamp"` | BSON Timestamp | `Timestamp(1640521800, 1)` |
| `Long` | `integer` with `format: "int64"` | BSON Long | `NumberLong("9223372036854775807")` |
| `UUID` | `string` with `format: "uuid"` | UUID v4 | `UUID("550e8400-e29b-41d4-a716-446655440000")` |

**Type Hints**: MongoForge preserves type information using vendor extension `x-gen.mongoType` in the generation schema. This ensures synthetic documents use correct BSON types when inserted into MongoDB.

## Documentation

- **Quickstart Guide**: [specs/001-mongodb-doc-gen/quickstart.md](specs/001-mongodb-doc-gen/quickstart.md)
- **CLI Reference**: [specs/001-mongodb-doc-gen/contracts/cli-commands.md](specs/001-mongodb-doc-gen/contracts/cli-commands.md)
- **Data Model**: [specs/001-mongodb-doc-gen/data-model.md](specs/001-mongodb-doc-gen/data-model.md)
- **Implementation Plan**: [specs/001-mongodb-doc-gen/plan.md](specs/001-mongodb-doc-gen/plan.md)

## Requirements

- **MongoDB**: 4.0 or later (for source collections)
- **Node.js**: 18.x or later
- **Access**: Read permission on source MongoDB collection
- **Disk Space**: Varies by output size (NDJSON files can be large for high doc counts)

## License

MIT

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Development mode
npm run dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
