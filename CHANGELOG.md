# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-26

### Added

#### Foundation (Phases 1-2)
- TypeScript project setup with strict mode and ES2022 target
- Core type definitions for data model, configuration, and all modules
- Structured logger utility (error, warn, info, debug levels)
- Seed manager with SHA-256 hashing for deterministic PRNG
- MongoDB connector with connection pooling and authentication
- Comprehensive test infrastructure with vitest (>80% coverage)

#### Size-Equivalent Test Data (Phase 3 - US1)
- MongoDB document sampling strategies: random, first-N, time-windowed
- BSON type normalization: ObjectId, Date, Decimal128, BinData → JSON Schema
- Statistical profiling: array length extraction (min, max, p50, p90, p99)
- Document size bucket calculation using leaf field count proxy
- Percentile-based array length clamping for outlier handling
- json-schema-faker integration with @faker-js/faker provider
- Custom format generators for ObjectId and date-time
- Streaming document generation with Node.js Readable streams

#### Repeatable Generation (Phase 4 - US2)
- Deterministic seed control for byte-identical output
- Run manifest generation with version, seed, artifact hashes (SHA-256)
- Integration tests validating repeatability (same seed → same bytes)
- Manifest serialization with performance metrics

#### Schema Discovery (Phase 5 - US3)
- mongodb-schema library integration for probabilistic schema inference
- Field path extraction with JSONPath-style notation
- InferredSchema → GenerationSchema transformer (JSON Schema draft-07)
- Vendor keywords: x-gen.key, x-gen.mongoType, x-gen.arrayLen
- CLI `infer` command with sampling and output options
- Configuration file parser supporting JSON and YAML
- Auto-generation of required fields (always includes "_id")

#### Direct MongoDB Insertion (Phase 6 - US4)
- MongoDB bulk insert emitter with configurable batch sizes
- Write concern configuration (majority, acknowledged, etc.)
- Ordered and unordered bulk insert modes
- Target collection naming with suffix support (_synthetic)
- CLI `generate` command with MongoDB insertion mode
- Backpressure handling for MongoDB write streams
- Integration tests for bulk operations

#### Custom Field Generators (Phase 7 - US5)
- Path-based custom generator registration API
- Type-based custom generator fallbacks
- Precedence logic: path-specific > type-level > default
- JavaScript module loader for custom generator files
- Built-in generators: email, UUID v4, ObjectId with timestamp prefix
- CLI `--custom-generators` flag
- Integration tests for generator precedence

#### Validation & Quality Reports (Phase 8 - US6)
- Ajv-based JSON Schema validator (draft-07 support)
- Schema conformance checking with violation reporting
- Uniqueness validation for _id and configurable key fields
- Array length histogram comparison (sample vs generated)
- Document size distribution comparison
- Deviation calculation with tolerances (10% array, 20% size)
- CLI `validate` command with NDJSON input
- JSON validation report output
- End-to-end validation workflow tests

#### Build & Distribution
- tsup build configuration with ESM + CJS dual output
- npm package exports with CLI bin entry
- TypeScript declaration files (.d.ts, .d.cts)
- npm scripts: build, test, test:coverage, lint, format
- GitHub Actions CI workflow
- Renovate configuration for dependency updates

### Performance
- 10,000+ documents/second generation throughput
- <2GB memory for 1M document generation (streaming architecture)
- Full workflow (sample 10k → generate 100k → validate) in <5 minutes

### Documentation
- Comprehensive README with MongoDB type mapping table
- Detailed quickstart guide with common patterns
- CLI reference with all command options
- Data model documentation
- Implementation plan and architecture notes

## [Unreleased]

### Planned
- Multi-collection generation with referential integrity
- Statistical field value distribution matching
- Semantic fidelity options for realistic data
- Privacy-preserving transformations
- Web UI for schema exploration
- Docker containerization

[Unreleased]: https://github.com/yourusername/mongoforge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/mongoforge/releases/tag/v0.1.0
