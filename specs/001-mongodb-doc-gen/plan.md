# Implementation Plan: Synthetic MongoDB Document Generator

**Branch**: `001-mongodb-doc-gen` | **Date**: 2025-12-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-mongodb-doc-gen/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build a CLI tool that generates high-volume synthetic MongoDB documents for CDC and load testing. The tool samples existing MongoDB collections to infer schema and statistical constraints (array lengths, document size distribution), then generates synthetic documents preserving structural fidelity (nested objects, array sizes, MongoDB types) without semantic fidelity. Core workflow: discovery phase (sample → infer schema → extract constraints), generation phase (stream synthetic docs with seed repeatability), optional validation phase (schema conformance + size equivalence reports). Primary users: database engineers, QA engineers, load testing teams.

## Technical Context

**Language/Version**: TypeScript 5.x+ (targeting Node.js 18.x or later)
**Primary Dependencies**:
- `mongodb` (official MongoDB Node.js driver) for database operations
- `mongodb-schema` for probabilistic schema inference
- `json-schema-faker` for JSON Schema-based synthetic data generation
- `@faker-js/faker` for custom format providers (avoiding legacy faker)
- `ajv` for JSON Schema validation
- `commander` for CLI argument parsing
- `ndjson` for NDJSON streaming
- `@types/*` for TypeScript definitions

**Storage**: MongoDB 4.0+ (read-only for source collections, optional write for target collections); local filesystem for NDJSON output, schema artifacts (JSON files), and run manifests
**Testing**: `vitest` with TypeScript support for unit/integration testing; contract tests for CLI commands; integration tests for MongoDB operations
**Target Platform**: Cross-platform CLI (Linux, macOS, Windows) targeting Node.js runtime
**Project Type**: Single CLI application (library-first architecture with CLI wrapper)
**Performance Goals**:
- 10,000 documents/second generation throughput to NDJSON on standard hardware (4-core CPU, 16GB RAM, SSD)
- Complete workflow (sample 10k docs → generate 100k synthetic docs → validate) in under 5 minutes
- Streaming generation to avoid memory bottlenecks

**Constraints**:
- Memory usage <2GB even when generating 1M documents (streaming required)
- Byte-identical output for identical seed+config (deterministic PRNG)
- Array length distributions within 10% of sample statistics (p50/p90/p99)
- Document size distribution within 20% of sample buckets
- 100% schema conformance for generated documents

**Scale/Scope**:
- Handle collections with diverse schemas (heterogeneous documents, union types)
- Support sample sizes from hundreds to tens of thousands of documents
- Generate from thousands to millions of synthetic documents per run
- CLI commands: `infer`, `generate`, `validate` (3 primary commands with subcommands/flags)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ✅ PASSED (no constitution defined - template-based project)

**Notes**:
- This project currently has a template constitution in `.specify/memory/constitution.md` that serves as a placeholder
- No specific project principles have been ratified yet
- Once the project establishes its own constitution (e.g., via `/speckit.constitution`), this section will be re-evaluated
- Default best practices applied: library-first architecture, CLI interface, test-driven development, simplicity-first approach

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── lib/                      # Core library modules (library-first)
│   ├── sampler/             # MongoDB document sampling
│   │   ├── index.ts
│   │   ├── strategies.ts    # Random, first-N, time-windowed
│   │   ├── connector.ts     # MongoDB connection handling
│   │   └── types.ts         # TypeScript type definitions
│   ├── normalizer/          # MongoDB type → JSON Schema normalization
│   │   ├── index.ts
│   │   ├── type-mappers.ts  # ObjectId, Date, Decimal128, BinData
│   │   └── types.ts
│   ├── inferencer/          # Schema inference engine
│   │   ├── index.ts
│   │   ├── mongodb-schema-wrapper.ts
│   │   └── types.ts
│   ├── synthesizer/         # Generation Schema producer
│   │   ├── index.ts
│   │   ├── vendor-keywords.ts  # x-gen keyword logic
│   │   └── types.ts
│   ├── profiler/            # Constraint extraction (array stats, size buckets)
│   │   ├── index.ts
│   │   ├── array-stats.ts
│   │   ├── size-buckets.ts
│   │   └── types.ts
│   ├── generator/           # Synthetic document generation
│   │   ├── index.ts
│   │   ├── faker-engine.ts  # json-schema-faker integration
│   │   ├── custom-formats.ts  # ObjectId, Date generators
│   │   ├── stream.ts        # Streaming generation logic
│   │   └── types.ts
│   ├── emitter/             # Output handling
│   │   ├── index.ts
│   │   ├── ndjson-writer.ts
│   │   ├── json-writer.ts
│   │   ├── mongo-inserter.ts
│   │   └── types.ts
│   ├── validator/           # Schema validation & quality reports
│   │   ├── index.ts
│   │   ├── schema-validator.ts  # AJV-based conformance
│   │   ├── quality-reporter.ts  # Array/size distribution comparison
│   │   └── types.ts
│   └── reporter/            # Run manifest generation
│       ├── index.ts
│       └── types.ts
├── cli/                     # CLI interface (thin wrapper over lib)
│   ├── index.ts            # CLI entry point
│   ├── commands/
│   │   ├── infer.ts        # Discovery phase command
│   │   ├── generate.ts     # Generation phase command
│   │   └── validate.ts     # Validation command
│   └── config/
│       ├── parser.ts       # Configuration file parsing
│       └── types.ts
├── types/                   # Shared TypeScript type definitions
│   ├── index.ts            # Re-exports all types
│   ├── data-model.ts       # Core data structures
│   └── config.ts           # Configuration types
└── utils/                   # Shared utilities
    ├── logger.ts           # Structured logging
    ├── seed-manager.ts     # PRNG seed handling
    └── types.ts

tests/
├── unit/                   # Unit tests (vitest)
│   ├── sampler/
│   ├── normalizer/
│   ├── inferencer/
│   ├── synthesizer/
│   ├── profiler/
│   ├── generator/
│   ├── emitter/
│   ├── validator/
│   └── reporter/
├── integration/            # Integration tests
│   ├── discovery-workflow.test.ts
│   ├── generation-workflow.test.ts
│   ├── mongo-operations.test.ts
│   └── end-to-end.test.ts
└── contract/              # CLI contract tests
    ├── infer-command.test.ts
    ├── generate-command.test.ts
    └── validate-command.test.ts

fixtures/                  # Test fixtures
├── sample-collections/   # Mock MongoDB data
└── expected-schemas/     # Reference schemas for validation

package.json
package-lock.json
tsconfig.json
vitest.config.ts
.gitignore
README.md
```

**Structure Decision**: Single project structure selected because this is a standalone CLI tool with no frontend/backend separation. Library-first architecture isolates core functionality in `src/lib/` from CLI interface in `src/cli/`, enabling future API reuse (e.g., programmatic usage, web service wrapper). Modular separation by functional phase (sampler, inferencer, generator, validator) aligns with the three-phase workflow (discovery, generation, validation) described in the spec.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A - No constitution violations. Project follows standard patterns for CLI tools with library-first architecture.

---

## Post-Design Constitution Re-evaluation

**Date**: 2025-12-26
**Status**: ✅ PASSED

After completing Phase 0 (research) and Phase 1 (design), re-evaluating against constitution principles:

**Architecture Alignment**:
- ✅ **Library-First**: Core functionality isolated in `src/lib/` modules (sampler, normalizer, inferencer, synthesizer, profiler, generator, emitter, validator, reporter), enabling reuse beyond CLI
- ✅ **CLI Interface**: Thin wrapper in `src/cli/` exposes library via text I/O protocol (args/stdin → stdout/stderr)
- ✅ **Single Responsibility**: Each module has clear purpose (e.g., sampler reads MongoDB, generator produces synthetic docs)
- ✅ **Testability**: Library modules independently testable; CLI contract tests separate from library unit tests

**Technology Choices**:
- ✅ **Mainstream Stack**: Node.js 18+, TypeScript 5.x+, standard MongoDB driver
- ✅ **Type Safety**: Strict TypeScript mode with comprehensive type definitions across all modules
- ✅ **Proven Libraries**: mongodb-schema (schema inference), json-schema-faker (generation), ajv (validation)
- ✅ **Security Posture**: Lockfile committed, npm audit in CI, Renovate/Dependabot for updates

**Design Simplicity**:
- ✅ **YAGNI Applied**: No over-engineering (no ORM, no complex DI framework, no premature abstractions)
- ✅ **Streaming-First**: Native Node.js streams meet performance goals without worker threads
- ✅ **Configuration**: Simple CLI flags + optional config file (no custom DSL or complex config framework)

**Deviations/Justifications**:
- None identified

**Conclusion**: Design adheres to standard best practices for CLI tools. No constitution violations detected post-design. Ready for Phase 2 (task generation via `/speckit.tasks`).
