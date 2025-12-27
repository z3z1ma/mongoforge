# Tasks: CDC and Mutation Modes

**Feature Branch**: `003-cdc-mutation-mode`
**Spec**: `specs/003-cdc-mutation-mode/spec.md`

## Phase 1: Setup
**Goal**: Initialize project structure and configuration for the new feature.

- [X] T001 Create directory structure for CDC components src/lib/generator/cdc src/lib/utils/cache
- [X] T002 Define shared types (MutationConfig, OperationType) in src/types/cdc.ts
- [X] T003 Register new command `mutate` in src/cli/index.ts

## Phase 2: Foundational Components
**Goal**: Implement the core data structures and interfaces required for tracking document IDs and defining operations.

- [X] T004 [P] Implement `DocumentIDCache` class in src/lib/utils/id-cache.ts
- [X] T005 [P] Create unit tests for `DocumentIDCache` in tests/unit/utils/id-cache.test.ts
- [X] T006 [P] Implement `MutationGenerator` service skeleton in src/lib/generator/mutation-engine.ts

## Phase 3: User Story 1 - Mutation Mode (Existing Data)
**Goal**: Enable running update/delete workloads against existing data (P1).

- [X] T007 [US1] Implement `MutationGenerator` strategy logic (regenerate, partial) in src/lib/generator/mutation-engine.ts
- [X] T008 [US1] Extend `MongoInserter` or create `MongoMutator` to support bulk update/delete ops in src/lib/emitter/mongo-inserter.ts
- [X] T009 [US1] Implement `mutate` command logic (args parsing, loop) in src/cli/commands/mutate.ts
- [X] T010 [US1] Add integration test for mutation mode in tests/integration/cdc-mutation.test.ts

## Phase 4: User Story 2 - CDC Simulation Mode
**Goal**: Enable mixed traffic generation (inserts + mutations) for load testing (P1).

- [X] T011 [US2] Implement `CDCStream` logic (OperationSelector, mixing ops) in src/lib/generator/cdc-stream.ts
- [X] T012 [US2] Integrate `DocumentIDCache` into `CDCStream` for targeting existing IDs in src/lib/generator/cdc-stream.ts
- [X] T013 [US2] Update `generate` command to support `--output mongo-cdc` and new flags in src/cli/commands/generate.ts
- [X] T014 [US2] Add CDC mode integration test cases in tests/integration/cdc-mutation.test.ts

## Phase 5: User Story 3 - Controlled Deletion Handling
**Goal**: Support different deletion behaviors like tombstoning (P2).

- [X] T015 [US3] Update `DocumentIDCache` to support 'tombstone' and 'keep' behaviors in src/lib/utils/id-cache.ts
- [X] T016 [US3] Update `CDCStream`/`MutationGenerator` to respect delete behaviors in src/lib/generator/cdc-stream.ts
- [X] T017 [US3] Add unit tests for delete behavior logic in tests/unit/utils/id-cache.test.ts

## Phase 6: User Story 4 - Throttled Execution
**Goal**: Limit operation rate to prevent overwhelming targets (P2).

- [X] T018 [US4] Implement rate limiting (token bucket or simple sleep) in src/lib/utils/rate-limiter.ts
- [X] T019 [US4] Integrate rate limiter into `mutate` command loop in src/cli/commands/mutate.ts
- [X] T020 [US4] Integrate rate limiter into `CDCStream` loop in src/lib/generator/cdc-stream.ts

## Phase 7: Polish & Cross-Cutting
**Goal**: Finalize documentation and ensure code quality.

- [X] T021 Ensure proper error handling for connection loss in src/lib/emitter/mongo-inserter.ts
- [X] T022 Update README.md with new command usage examples
- [X] T023 Run full integration test suite and verify no regressions

## Dependencies

1.  **Phase 2 (Foundation)** MUST complete before **Phase 3 (Mutation)** and **Phase 4 (CDC)**.
2.  **Phase 3** and **Phase 4** can theoretically be parallelized, but both depend on `MutationGenerator` and `DocumentIDCache`.
3.  **Phase 5** and **Phase 6** extend the functionality built in Phases 3 & 4.

## Implementation Strategy

1.  **Foundation First**: Build the `DocumentIDCache` and `MutationGenerator` logic.
2.  **MVP (Mutation)**: Get `mongoforge mutate` working first as it isolates the "update existing" logic.
3.  **MVP (CDC)**: Wire the mutation logic into the generation stream for the full simulation.
4.  **Refinement**: Add the specialized behaviors (tombstones, throttling) last.
