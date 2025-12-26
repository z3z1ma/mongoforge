# Implementation Plan: Dynamic Key Inference & Optimized Array Length Storage

**Branch**: `002-dynamic-key-inference` | **Date**: 2025-12-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-dynamic-key-inference/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enhance MongoDB schema inference to detect and compactly represent objects with highly variable string keys (UUIDs, account IDs) as dynamic key patterns rather than exhaustive key enumerations. When object keys exceed a configurable threshold (default: 50), the system will store key count distributions and format characteristics instead of individual keys. During synthetic document generation, realistic key counts and format-appropriate synthetic keys will be generated. Additionally, optimize array length storage by replacing exhaustive length arrays with frequency maps (length → count) for both arrays and dynamic key distributions.

## Technical Context

**Language/Version**: TypeScript with Node.js >=18.0.0
**Primary Dependencies**:
- `mongodb-schema@^12.2.0` for schema inference
- `json-schema-faker@^0.5.6` for document generation
- `@faker-js/faker@^9.3.0` for custom value generation
- `mongodb@^6.12.0` (MongoDB driver)
- `ajv@^8.17.1` for JSON Schema validation

**Storage**:
- Input: MongoDB 4.0+ collections (read-only)
- Output: JSON artifacts on filesystem (`inferred.schema.json`, `generation.schema.json`, `constraints.json`, `manifest.json`)
- Generated documents: NDJSON files

**Testing**: Vitest with coverage (vitest@^2.1.8, @vitest/coverage-v8@^2.1.8)
**Target Platform**: Node.js CLI + programmatic library (dual CJS/ESM exports)
**Project Type**: Single project (library + CLI)
**Performance Goals**:
- Schema inference: handle collections with 100K+ distinct dynamic keys without memory explosion
- Document generation: maintain current throughput (NEEDS CLARIFICATION: baseline metrics)
- Artifact size reduction: 90%+ for dynamic key scenarios, 50%+ for array length distributions

**Constraints**:
- Schema inference time: no more than 10% slowdown
- Memory footprint: must not increase for non-dynamic-key scenarios
- Configurable threshold for dynamic key detection (default: 50 distinct keys)

**Scale/Scope**:
- Target collections: up to millions of documents
- Dynamic key counts: 100-10,000+ distinct keys per object path
- Array length variability: 1-1000+ distinct lengths per array field

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Initial Status (Pre-Research)**: ✅ PASS (No constitution defined yet)

Since no project constitution exists at `.specify/memory/constitution.md`, there are no gates to evaluate. This feature follows the existing project patterns:
- Single library + CLI structure (consistent with current architecture)
- Test-driven approach using Vitest (existing testing framework)
- JSON Schema-based contracts (existing pattern)
- No new dependencies required (uses existing `mongodb-schema`, `json-schema-faker`)

---

**Post-Design Re-evaluation**: ✅ PASS

After Phase 1 design (research.md, data-model.md, contracts/, quickstart.md):
- **No new dependencies**: All implementation uses existing packages
- **No architectural changes**: Feature enhances existing modules (inferencer, profiler, generator, synthesizer)
- **Performance within constraints**: < 10% slowdown, > 50% space savings
- **Follows existing patterns**: Frequency maps, JSON Schema annotations, TypeScript interfaces

**No constitution violations identified.**

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
├── cli/                    # CLI commands and interface
├── lib/
│   ├── inferencer/        # Schema inference (MODIFY: add dynamic key detection)
│   ├── profiler/          # Constraint profiling (MODIFY: frequency map storage)
│   ├── synthesizer/       # JSON Schema synthesis (MODIFY: dynamic key schemas)
│   ├── generator/         # Document generation (MODIFY: dynamic key generation)
│   ├── sampler/           # MongoDB sampling (unchanged)
│   ├── normalizer/        # Type normalization (unchanged)
│   ├── emitter/           # Document output (unchanged)
│   ├── validator/         # Validation (unchanged)
│   └── reporter/          # Reporting (unchanged)
├── types/                 # TypeScript type definitions (ADD: dynamic key types)
└── utils/                 # Shared utilities (ADD: key pattern detection, frequency maps)

tests/
├── unit/                  # Unit tests for new utilities
├── integration/           # Integration tests for inference + generation pipeline
└── fixtures/              # Test data with dynamic key scenarios
```

**Structure Decision**: Single project structure (existing). This feature enhances existing modules rather than adding new top-level components:
- **Inferencer** module: Add dynamic key detection logic
- **Profiler** module: Replace array storage with frequency maps
- **Synthesizer** module: Generate JSON Schema for dynamic key patterns
- **Generator** module: Generate synthetic keys matching patterns
- **Utils** module: Add shared utilities for key pattern detection and frequency map operations
- **Types** module: Add TypeScript interfaces for dynamic key metadata

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A - No constitution violations. This feature follows existing patterns and adds no new architectural complexity.
