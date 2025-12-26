# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial MVP implementation (Phases 1-4)
- MongoDB sampling with multiple strategies (random, first-N, time-windowed)
- BSON type normalization (ObjectId, Date, Decimal128, BinData → JSON Schema)
- Statistical profiling for array lengths and document sizes
- Synthetic document generation with json-schema-faker
- Deterministic seed control for byte-identical repeatability
- Run manifests with SHA-256 artifact hashes
- Streaming generation for memory efficiency
- TypeScript strict mode with comprehensive type definitions
- Integration tests for core workflows

## [0.1.0] - TBD

### Added
- Schema discovery and export (mongoforge infer command)
- Direct MongoDB insertion with bulk write support
- Custom field value generators with override API
- Validation and quality reporting (mongoforge validate command)
- CLI with commander.js
- ESM + CJS dual package support
- Comprehensive integration tests
- Full documentation

[Unreleased]: https://github.com/yourusername/mongoforge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/mongoforge/releases/tag/v0.1.0
