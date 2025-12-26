# Research: Synthetic MongoDB Document Generator

**Feature**: 001-mongodb-doc-gen
**Date**: 2025-12-26
**Status**: Complete

## Overview

This document captures research decisions for implementing a high-performance CLI tool that generates synthetic MongoDB documents for load testing and CDC validation. Research focused on: (1) TypeScript/JavaScript ecosystem tooling for schema inference and data generation, (2) streaming patterns for memory-efficient large-scale generation, (3) deterministic PRNG approaches for repeatable output, (4) MongoDB type handling in JSON Schema contexts, (5) TypeScript best practices for Node.js CLI tools.

## Key Technology Decisions

### 1. Schema Inference: mongodb-schema

**Decision**: Use `mongodb-schema` (npm package) for probabilistic schema inference from MongoDB collections.

**Rationale**:
- Battle-tested library specifically designed for MongoDB schema analysis
- Handles heterogeneous documents and union types natively
- Captures field presence rates, type distributions, and nested structures
- Actively maintained and used in MongoDB ecosystem tools

**Alternatives Considered**:
- **Custom schema inference**: Rejected because reinventing inference logic introduces bugs and maintenance burden. `mongodb-schema` is field-proven.
- **variety.js**: Rejected because it's less actively maintained and has weaker TypeScript support compared to `mongodb-schema`.

**Implementation Notes**:
- `mongodb-schema` output is "schema-like" but not strict JSON Schema draft-07. Requires transformation layer (SchemaSynthesizer module) to produce conformant schemas.
- Supports field path extraction, type inference (including BSON types), and optionality detection out of the box.

**References**:
- npm: https://www.npmjs.com/package/mongodb-schema
- GitHub: https://github.com/mongodb-js/mongodb-schema

---

### 2. Synthetic Data Generation: json-schema-faker + @faker-js/faker

**Decision**: Use `json-schema-faker` as the generation engine, with `@faker-js/faker` as the faker provider for custom formats.

**Rationale**:
- `json-schema-faker` is the most mature library for generating data from JSON Schema definitions in the JavaScript ecosystem
- Supports JSON Schema draft-07 (our target schema version)
- Extensible format system allows custom generators for MongoDB types (ObjectId, Date, Decimal128)
- `@faker-js/faker` is the community-maintained fork avoiding the legacy `faker` package (which had a 2022 supply-chain incident)

**Alternatives Considered**:
- **jsf (JSON Schema Faker CLI)**: Rejected because it's a CLI wrapper around `json-schema-faker` and doesn't provide programmatic API control we need.
- **Custom generation engine**: Rejected because implementing a JSON Schema-compliant generator is complex and error-prone. Leveraging existing library reduces risk.
- **chance.js or casual**: Rejected because they don't have built-in JSON Schema support; would require manual mapping layer.

**Known Issues**:
- `json-schema-faker` dependency chain has had historical audit warnings (transitive dependencies). Mitigated by:
  - Lockfile commitment (package-lock.json)
  - CI npm audit gate
  - Renovate/Dependabot for monitoring updates
- If audit fails block deployment, spec allows swapping generation implementation without changing module interfaces.

**Implementation Notes**:
- Register custom formats for MongoDB types: `objectid` (generate valid ObjectId strings), `date-time` (ISO 8601 dates), `uuid` (v4 UUIDs)
- Seed control: `json-schema-faker` supports seeding via `faker.seed()` for deterministic generation
- Array length control: Use `minItems`/`maxItems` in JSON Schema to enforce array length constraints from profiler

**References**:
- json-schema-faker: https://github.com/json-schema-faker/json-schema-faker
- @faker-js/faker: https://www.npmjs.com/package/@faker-js/faker
- Historical context on faker incident: https://snyk.io/blog/open-source-npm-packages-colors-faker/

---

### 3. JSON Schema Validation: Ajv (Another JSON Schema Validator)

**Decision**: Use `ajv` for validating generated documents against the Generation Schema.

**Rationale**:
- Industry-standard JSON Schema validator in Node.js ecosystem
- Supports draft-07 (our target)
- High performance (compiles schemas to optimized validation functions)
- Comprehensive error reporting for schema violations

**Alternatives Considered**:
- **tv4**: Rejected because it's less actively maintained and slower than Ajv.
- **jsonschema**: Rejected because Ajv has better draft-07 support and performance.

**Implementation Notes**:
- Use Ajv in strict mode for schema conformance checks
- Compile schemas once during validation phase startup for performance
- Validation runs post-generation (not inline during generation) to avoid throughput bottlenecks

**References**:
- npm: https://www.npmjs.com/package/ajv
- Documentation: https://ajv.js.org/

---

### 4. CLI Argument Parsing: commander

**Decision**: Use `commander` for CLI argument and subcommand parsing.

**Rationale**:
- Most popular Node.js CLI framework with 28M+ weekly downloads
- Clean API for defining commands (`infer`, `generate`, `validate`) and options
- Built-in help generation and error handling
- Widely adopted (used by Vue CLI, Create React App, etc.)

**Alternatives Considered**:
- **yargs**: Strong alternative with similar capabilities. Rejected due to slightly more verbose API compared to commander's declarative style.
- **minimist**: Rejected because it's low-level and requires manual help/error handling.

**Implementation Notes**:
- Define three commands: `mongoforge infer`, `mongoforge generate`, `mongoforge validate`
- Use option flags for configuration (e.g., `--source-uri`, `--seed`, `--output`)
- Support configuration file (JSON/YAML) via `--config` flag, parsed separately

**References**:
- npm: https://www.npmjs.com/package/commander
- Documentation: https://github.com/tj/commander.js

---

### 5. Streaming and High-Throughput Generation

**Decision**: Use Node.js Streams (Readable/Transform/Writable) with NDJSON format for streaming generation.

**Rationale**:
- Native Node.js streams provide backpressure handling and memory-efficient processing
- NDJSON (newline-delimited JSON) allows incremental writing without holding entire array in memory
- Achieves throughput goals (10k docs/sec) and memory constraints (<2GB for 1M docs)

**Alternatives Considered**:
- **Batch generation (store in array)**: Rejected because it violates memory constraint for large generation runs.
- **Worker threads**: Deferred to future optimization; single-threaded streaming meets SC-003 throughput goal (10k docs/sec) on target hardware.

**Implementation Notes**:
- Generator module exposes Readable stream that yields synthetic documents
- Emitter module consumes stream and writes to NDJSON file or pipes to MongoDB bulk inserter
- Use `ndjson` npm package for robust NDJSON streaming

**Best Practices**:
- Use `stream.pipeline()` for automatic error propagation and cleanup
- Implement backpressure handling in custom stream implementations
- Monitor memory usage in integration tests to validate <2GB constraint

**References**:
- Node.js Streams: https://nodejs.org/api/stream.html
- NDJSON spec: http://ndjson.org/
- ndjson package: https://www.npmjs.com/package/ndjson

---

### 6. Deterministic PRNG and Seed Management

**Decision**: Use `@faker-js/faker`'s built-in seeding mechanism for deterministic generation.

**Rationale**:
- Faker's `faker.seed(value)` provides deterministic random generation when seeded
- Simple API: pass same seed → get same output sequence
- Meets SC-005 requirement (byte-identical output for identical seed/config)

**Alternatives Considered**:
- **seedrandom package**: Rejected because Faker's built-in seeding is sufficient and reduces dependencies.
- **Custom PRNG**: Rejected due to complexity and risk of introducing non-determinism bugs.

**Implementation Notes**:
- Accept seed as string or number via CLI `--seed` flag
- Hash seed to number for Faker if provided as string (use Node.js crypto.createHash)
- Document seed in run manifest for reproducibility
- Validate repeatability in integration tests (generate twice with same seed, compare outputs)

**References**:
- Faker seeding: https://fakerjs.dev/guide/usage.html#reproducible-results

---

### 7. MongoDB Operations: Official mongodb Driver

**Decision**: Use official `mongodb` Node.js driver for all database operations.

**Rationale**:
- Official driver maintained by MongoDB Inc.
- Supports MongoDB 4.0+ (our minimum version)
- Handles connection pooling, authentication, and BSON types natively
- Battle-tested and widely adopted

**Alternatives Considered**:
- **Mongoose**: Rejected because we don't need ODM features (schema enforcement, middleware); we're reading raw documents and inserting synthetic data.
- **monk**: Rejected because it's a thin wrapper around mongodb driver with no significant benefits for our use case.

**Implementation Notes**:
- Use `MongoClient` for connection management
- Sampling: Use `collection.aggregate([{ $sample: { size: N } }])` for random sampling (efficient server-side)
- Insertion: Use `collection.bulkWrite()` for batch inserts with configurable write concern
- BSON type handling: Access extended types via driver's BSON utilities (ObjectId, Decimal128, etc.)

**Best Practices**:
- Connection pooling: Use default pool settings (100 connections)
- Error handling: Wrap operations in try/catch, provide user-friendly error messages for connection failures
- Authentication: Support connection URI format (mongodb://user:pass@host/db) for credentials

**References**:
- npm: https://www.npmjs.com/package/mongodb
- Documentation: https://www.mongodb.com/docs/drivers/node/current/

---

### 8. Testing Framework: Vitest

**Decision**: Use `vitest` for unit, integration, and contract testing.

**Rationale**:
- Modern, fast test runner with excellent ESM support
- Compatible with Jest API (easy migration if needed)
- Built-in coverage reporting
- Fast watch mode for TDD workflow

**Alternatives Considered**:
- **Jest**: Strong alternative with larger ecosystem. Rejected because Vitest is faster and has better ESM support (important for modern Node.js projects).
- **Mocha + Chai**: Rejected because Vitest provides batteries-included experience (assertions, mocking, coverage) without extra packages.

**Implementation Notes**:
- Unit tests: Test individual modules (sampler, normalizer, generator, etc.) in isolation
- Integration tests: Test workflows (discovery → generation → validation) with in-memory MongoDB (mongodb-memory-server)
- Contract tests: Test CLI commands via child_process spawning, verify stdout/stderr/exit codes

**Best Practices**:
- Use `mongodb-memory-server` for integration tests (avoids external MongoDB dependency)
- Mock `json-schema-faker` in unit tests to control generated data
- Aim for >80% code coverage (configurable threshold in vitest.config.js)

**References**:
- Vitest: https://vitest.dev/
- mongodb-memory-server: https://www.npmjs.com/package/mongodb-memory-server

---

### 9. Configuration Management

**Decision**: Support both CLI flags and configuration files (JSON/YAML) using `commander` + manual file parsing.

**Rationale**:
- CLI flags: Good for one-off runs and scripting
- Config files: Good for repeatable workflows and complex configurations
- Hybrid approach: CLI flags override config file values (standard precedence)

**Alternatives Considered**:
- **CLI flags only**: Rejected because typing long URIs and many options is error-prone.
- **Config files only**: Rejected because simple use cases should work without creating a file.

**Implementation Notes**:
- Use `commander` for CLI flag parsing
- Support `--config <path>` flag to load JSON or YAML configuration file
- Use `js-yaml` package for YAML parsing (JSON is native)
- Merge strategy: config file provides defaults, CLI flags override

**Configuration Schema** (example):
```yaml
source:
  uri: mongodb://localhost:27017
  database: production
  collection: users
  sampleSize: 10000
  samplingStrategy: random

constraints:
  arrayLenPolicy: percentileClamp
  percentiles: [50, 90, 99]
  clampRange: [1, 99]

generation:
  docCount: 100000
  seed: "test-seed-123"

output:
  format: ndjson
  path: ./output/synthetic-users.ndjson
```

**References**:
- js-yaml: https://www.npmjs.com/package/js-yaml

---

### 10. MongoDB Type Normalization Strategies

**Decision**: Map MongoDB BSON types to JSON Schema string formats with custom annotations.

**Rationale**:
- JSON Schema doesn't natively support MongoDB types (ObjectId, Decimal128, etc.)
- Using `type: "string"` with `format: "objectid"` (custom format) preserves type semantics for generation
- Allows round-trip: BSON type → JSON Schema → synthetic BSON-like value

**Type Mappings**:
| MongoDB Type | JSON Schema Type | JSON Schema Format | Example Value |
|--------------|------------------|-------------------|---------------|
| ObjectId     | string           | objectid (custom) | "507f1f77bcf86cd799439011" |
| Date         | string           | date-time         | "2025-12-26T10:30:00.000Z" |
| Decimal128   | string or number | decimal (custom)  | "123.456789" or 123.456789 (configurable) |
| BinData      | string           | base64 (custom)   | "SGVsbG8gV29ybGQ=" |
| UUID         | string           | uuid              | "550e8400-e29b-41d4-a716-446655440000" |

**Implementation Notes**:
- Normalizer module converts BSON types to JSON Schema representations
- Generator module registers custom format generators for `objectid`, `decimal`, `base64`
- Use MongoDB driver's BSON utilities to generate valid ObjectIds, handle Decimal128

**Best Practices**:
- Document type mappings in README for user transparency
- Provide configuration option to control Decimal128 representation (string vs number)
- Validate that generated ObjectIds are valid 24-character hex strings

---

### 11. TypeScript Configuration and Build Tooling

**Decision**: Use TypeScript 5.x+ with strict mode, targeting ES2022 for Node.js 18+ compatibility.

**Rationale**:
- Type safety prevents runtime errors and improves IDE support
- Modern ES2022 features (top-level await, error cause) align with Node.js 18+
- Strict mode catches common bugs at compile time
- tsup or esbuild for fast, zero-config bundling

**Alternatives Considered**:
- **Plain JavaScript with JSDoc**: Rejected because TypeScript provides superior type checking and refactoring support
- **Babel for transpilation**: Rejected because native TypeScript compiler is sufficient for Node.js targets
- **webpack**: Rejected because tsup/esbuild are faster and simpler for CLI tools

**Implementation Notes**:
- `tsconfig.json` with strict mode, ES2022 target, node module resolution
- Use `tsup` for bundling (produces both ESM and CJS outputs)
- Development: `tsx` for running TypeScript directly in dev
- Types exported from `src/types/` for library consumers

**TypeScript Configuration**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

**References**:
- TypeScript: https://www.typescriptlang.org/
- tsup: https://tsup.egoist.dev/

---

## Resolved Clarifications

All technical context items from plan.md have been resolved through research:

1. ✅ **Language/Version**: TypeScript 5.x+ (targeting Node.js 18.x+)
2. ✅ **Primary Dependencies**: mongodb, mongodb-schema, json-schema-faker, @faker-js/faker, ajv, commander, ndjson, @types/*
3. ✅ **Testing**: vitest with TypeScript support for unit/integration/contract tests
4. ✅ **CLI Framework**: commander for argument parsing
5. ✅ **Streaming**: Native Node.js streams with NDJSON format
6. ✅ **PRNG**: @faker-js/faker seeding for deterministic generation
7. ✅ **Type Handling**: Custom JSON Schema formats for MongoDB types
8. ✅ **Configuration**: Hybrid CLI flags + config file (JSON/YAML)
9. ✅ **Build Tooling**: tsup for bundling, tsx for development
10. ✅ **Type Safety**: Strict TypeScript mode with comprehensive type definitions

---

## Next Steps (Phase 1)

With research complete, Phase 1 will proceed to:
1. **data-model.md**: Define internal data structures (InferredSchema, GenerationSchema, ConstraintsProfile, RunManifest)
2. **contracts/**: Define CLI command contracts (input/output schemas for `infer`, `generate`, `validate`)
3. **quickstart.md**: Create getting-started guide for users

---

**Research Sign-off**: All NEEDS CLARIFICATION items resolved. Ready for Phase 1 design.
