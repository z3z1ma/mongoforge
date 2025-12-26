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

## Documentation

- **Quickstart Guide**: [specs/001-mongodb-doc-gen/quickstart.md](specs/001-mongodb-doc-gen/quickstart.md)
- **CLI Reference**: [specs/001-mongodb-doc-gen/contracts/cli-commands.md](specs/001-mongodb-doc-gen/contracts/cli-commands.md)
- **Data Model**: [specs/001-mongodb-doc-gen/data-model.md](specs/001-mongodb-doc-gen/data-model.md)
- **Implementation Plan**: [specs/001-mongodb-doc-gen/plan.md](specs/001-mongodb-doc-gen/plan.md)

## Requirements

- **MongoDB**: 4.0 or later
- **Node.js**: 18.x or later

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
