# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature implements two new modes for `mongoforge`: `mutate` for running update/delete workloads against existing data, and `generate --output mongo-cdc` for simulating mixed traffic (insert/update/delete) with in-memory ID tracking.

## Technical Context

**Language/Version**: TypeScript 5.7 (Node.js >=18)
**Primary Dependencies**: `mongodb` (v6.12.0), `@faker-js/faker` (v9.3.0), `commander` (v12.1.0)
**Storage**: MongoDB (target system), In-Memory (DocumentIDCache)
**Testing**: `vitest`
**Target Platform**: CLI (Node.js)
**Project Type**: Single CLI package
**Performance Goals**: ~1000 ops/sec on local hardware
**Constraints**: In-memory ID cache must fit in available RAM (target 10-20MB for 100k IDs)
**Scale/Scope**: Extensions to existing CLI; new logic in `src/lib/generator` and `src/lib/emitter`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*   **I. Library-First**: Logic will be implemented in `src/lib` (e.g., `src/lib/generator/cdc-engine.ts`) and exposed via CLI. **PASS**
*   **II. CLI Interface**: New commands/flags follow standard `commander` patterns. **PASS**
*   **III. Test-First**: Plan includes unit tests for `DocumentIDCache` and integration tests for `mutate`. **PASS**

## Project Structure

### Documentation (this feature)

```text
specs/003-cdc-mutation-mode/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cli-commands.md
└── tasks.md             # Phase 2 output (to be created)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── commands/
│   │   ├── mutate.ts        # New command
│   │   └── generate.ts      # Update for --output mongo-cdc
├── lib/
│   ├── generator/
│   │   ├── mutation-engine.ts # Logic for generating updates/deletes
│   │   └── cdc-stream.ts      # Stream logic for CDC mode
│   ├── emitter/
│   │   └── mongo-inserter.ts  # Update to handle updates/deletes
│   └── utils/
│       └── id-cache.ts        # DocumentIDCache implementation
tests/
├── unit/
│   └── utils/
│       └── id-cache.test.ts
└── integration/
    └── cdc-mutation.test.ts
```

**Structure Decision**: Option 1 (Single project). We are extending the existing CLI codebase structure.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations.*
