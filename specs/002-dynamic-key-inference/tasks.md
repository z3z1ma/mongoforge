# Tasks: Dynamic Key Inference & Optimized Array Length Storage

**Input**: Design documents from `/specs/002-dynamic-key-inference/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT requested in this specification. Tasks focus on implementation only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project structure: `src/`, `tests/` at repository root
- Paths shown below follow existing mongoforge structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and type definitions for dynamic key feature

- [X] T001 Create TypeScript type definitions in src/types/dynamic-keys.ts for FrequencyDistribution, DistributionStats, DynamicKeyPattern, ConfidenceLevel
- [X] T002 [P] Create TypeScript type definitions in src/types/dynamic-keys.ts for DynamicKeyMetadata, DynamicKeyValueSchema
- [X] T003 [P] Create TypeScript type definitions in src/types/dynamic-keys.ts for ArrayLengthStats, DynamicKeyDetectionConfig
- [X] T004 Create shared frequency distribution utilities in src/utils/frequency-map.ts with calculateFrequencies, sampleFromDistribution, getPercentile functions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities and infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement key pattern detection regex library in src/utils/key-patterns.ts with patterns for UUID, MONGODB_OBJECTID, ULID, NUMERIC_ID, PREFIXED_ID
- [X] T006 [P] Implement pattern matching algorithm in src/utils/key-patterns.ts with detectDynamicKeys, calculatePatternMatch, computeConfidenceScore functions
- [X] T007 [P] Implement distribution statistics calculator in src/utils/frequency-map.ts with calculateDistributionStats function (min, max, median, p95, total, unique)
- [X] T008 Create configuration loader in src/utils/config-loader.ts to load DynamicKeyDetectionConfig from CLI flags and config files
- [X] T009 Add CLI flag --dynamic-key-threshold to src/cli/commands/generate.ts and src/cli/commands/infer.ts
- [X] T010 [P] Add CLI flag --no-dynamic-keys to src/cli/commands/generate.ts and src/cli/commands/infer.ts
- [X] T011 [P] Update programmatic API types in src/lib/inferencer/types.ts to include dynamicKeyDetection option

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Schema Inference with Dynamic Key Detection (Priority: P1) 🎯 MVP

**Goal**: Detect objects with highly variable string keys and represent them as dynamic key patterns instead of exhaustive key enumerations

**Independent Test**: Run schema inference on a collection with 50+ distinct UUID-based keys and verify the schema uses x-dynamic-keys annotation instead of individual key properties

### Implementation for User Story 1

- [X] T012 [P] [US1] Create dynamic key detector in src/lib/inferencer/dynamic-key-detector.ts with analyzeObjectKeys function
- [X] T013 [P] [US1] Implement key counting logic in src/lib/inferencer/dynamic-key-detector.ts with countUniqueKeys function
- [X] T014 [US1] Implement threshold check in src/lib/inferencer/dynamic-key-detector.ts that compares key count to configured threshold
- [X] T015 [US1] Implement pattern matching in src/lib/inferencer/dynamic-key-detector.ts that applies regex patterns to keys and calculates match ratios
- [X] T016 [US1] Implement confidence scoring in src/lib/inferencer/dynamic-key-detector.ts that computes confidence based on pattern match ratios
- [X] T017 [US1] Create DynamicKeyMetadata builder in src/lib/inferencer/dynamic-key-detector.ts that constructs metadata with pattern, confidence, countDistribution, exampleKeys
- [X] T018 [US1] Implement value type analyzer in src/lib/inferencer/dynamic-key-detector.ts that analyzes value types for dynamic keys and creates DynamicKeyValueSchema
- [X] T019 [US1] Integrate dynamic key detection into existing inferencer in src/lib/inferencer/index.ts as post-processing step after mongodb-schema inference
- [X] T020 [US1] Update schema synthesizer in src/lib/synthesizer/index.ts to add x-dynamic-keys annotation to JSON Schema when dynamic keys detected
- [X] T021 [US1] Update inferred.schema.json output in src/lib/inferencer/index.ts to exclude individual dynamic key properties
- [X] T022 [US1] Update generation.schema.json output in src/lib/synthesizer/index.ts to include x-dynamic-keys with metadata and valueSchema
- [X] T023 [US1] Add logging for dynamic key detection decisions in src/lib/inferencer/dynamic-key-detector.ts with debug information
- [X] T024 [US1] Handle edge case: exactly threshold number of keys in src/lib/inferencer/dynamic-key-detector.ts (treat as dynamic if pattern matches)
- [X] T025 [US1] Handle edge case: mixed static and dynamic keys in src/lib/inferencer/dynamic-key-detector.ts (detect per field path)
- [X] T026 [US1] Implement forceStaticPaths override logic in src/lib/inferencer/dynamic-key-detector.ts to skip detection for specific paths
- [X] T027 [US1] Implement forceDynamicPaths override logic in src/lib/inferencer/dynamic-key-detector.ts to force detection for specific paths

**Checkpoint**: At this point, User Story 1 should be fully functional - schema inference detects dynamic keys and produces compact schemas with x-dynamic-keys annotations

---

## Phase 4: User Story 2 - Array Length Distribution Storage Optimization (Priority: P2)

**Goal**: Replace exhaustive array length storage with frequency maps to reduce artifact size and improve clarity

**Independent Test**: Run schema inference on a collection with arrays of varying lengths (1-100 elements) and verify constraints.json stores length distribution as frequency map format

### Implementation for User Story 2

- [X] T028 [US2] Update array stats profiler in src/lib/profiler/array-stats.ts to use Map<number, number> for length storage instead of number[]
- [X] T029 [US2] Replace array length collection logic in src/lib/profiler/array-stats.ts with frequency map updates
- [X] T030 [US2] Update percentile calculation in src/lib/profiler/array-stats.ts to use frequency distribution with getPercentile utility
- [X] T031 [US2] Update serialization in src/lib/profiler/array-stats.ts to output ArrayLengthStats format with distribution and stats fields
- [X] T032 [US2] Update constraints.json schema in src/lib/profiler/index.ts to use new frequency map format for arrayLengths field
- [X] T033 [US2] Update schema synthesizer in src/lib/synthesizer/index.ts to add x-array-length-distribution annotation to JSON Schema for arrays
- [X] T034 [US2] Add backward compatibility check in src/lib/profiler/array-stats.ts for reading old array format (if needed for migration)
- [X] T035 [US2] Update array length sampling in src/lib/generator/index.ts to use sampleFromDistribution when generating arrays

**Checkpoint**: At this point, User Story 2 should be fully functional - array lengths stored as frequency maps with significant space savings

---

## Phase 5: User Story 3 - Synthetic Document Generation with Dynamic Keys (Priority: P1)

**Goal**: Generate synthetic documents with realistic key counts and synthetic key names that match inferred pattern characteristics

**Independent Test**: Generate synthetic documents from a schema with x-dynamic-keys annotation and verify generated objects contain correct number of keys (within observed ranges) with appropriately formatted synthetic key names

### Implementation for User Story 3

- [ ] T036 [P] [US3] Create dynamic key generator in src/lib/generator/dynamic-key-generator.ts with generateDynamicKeys function
- [ ] T037 [P] [US3] Implement key count selection in src/lib/generator/dynamic-key-generator.ts using sampleFromDistribution on countDistribution
- [ ] T038 [US3] Implement pattern-specific key generators in src/lib/generator/dynamic-key-generator.ts for UUID, MONGODB_OBJECTID, ULID, NUMERIC_ID, PREFIXED_ID patterns
- [ ] T039 [US3] Implement generic key generator in src/lib/generator/dynamic-key-generator.ts for CUSTOM pattern using faker.string.alphanumeric
- [ ] T040 [US3] Implement uniqueness guarantee in src/lib/generator/dynamic-key-generator.ts using deterministic seeded generation with counter
- [ ] T041 [US3] Create value generator for dynamic keys in src/lib/generator/dynamic-key-generator.ts that samples from DynamicKeyValueSchema types and probabilities
- [ ] T042 [US3] Implement schema preprocessor in src/lib/generator/schema-preprocessor.ts that detects x-dynamic-keys annotation
- [ ] T043 [US3] Implement dynamic key expansion in src/lib/generator/schema-preprocessor.ts that generates static properties object for json-schema-faker
- [ ] T044 [US3] Integrate schema preprocessor in src/lib/generator/index.ts to run before json-schema-faker generation
- [ ] T045 [US3] Update custom format registry in src/lib/generator/custom-formats.ts to support dynamic key formats if needed
- [ ] T046 [US3] Handle edge case: nested dynamic keys in src/lib/generator/schema-preprocessor.ts (recursive preprocessing)
- [ ] T047 [US3] Handle edge case: mixed value types in src/lib/generator/dynamic-key-generator.ts using type probability sampling
- [ ] T048 [US3] Add validation in src/lib/generator/dynamic-key-generator.ts to ensure generated keys match expected pattern format

**Checkpoint**: All user stories should now be independently functional - dynamic keys detected, stored compactly, and generated realistically

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T049 [P] Add integration test fixtures in tests/fixtures/ for collections with dynamic keys (UUID-based, ObjectId-based, numeric IDs)
- [X] T050 [P] Add integration test fixtures in tests/fixtures/ for collections with variable-length arrays
- [X] T051 Create end-to-end integration test in tests/integration/dynamic-keys.test.ts that runs full inference + generation pipeline
- [X] T052 [P] Add unit tests in tests/unit/frequency-map.test.ts for frequency distribution utilities
- [X] T053 [P] Add unit tests in tests/unit/key-patterns.test.ts for pattern detection and matching
- [X] T054 [P] Add unit tests in tests/unit/dynamic-key-detector.test.ts for dynamic key detection logic
- [X] T055 [P] Add unit tests in tests/unit/dynamic-key-generator.test.ts for synthetic key generation
- [X] T056 Update CLI help text in src/cli/commands/generate.ts and src/cli/commands/infer.ts with dynamic key options
- [ ] T057 [P] Add JSON Schema validation in src/lib/validator/index.ts for DynamicKeyMetadata structure
- [ ] T058 [P] Add JSON Schema validation in src/lib/validator/index.ts for ArrayLengthStats structure
- [X] T059 Update README.md with dynamic key feature overview and quickstart example
- [X] T060 [P] Add code comments and JSDoc in src/lib/inferencer/dynamic-key-detector.ts
- [X] T061 [P] Add code comments and JSDoc in src/lib/generator/dynamic-key-generator.ts
- [X] T062 Performance benchmarking: measure inference time impact with dynamic key detection enabled
- [X] T063 Performance benchmarking: measure generation throughput with dynamic key expansion
- [X] T064 Memory profiling: verify no memory increase for non-dynamic-key scenarios
- [X] T065 Run quickstart.md validation scenarios and verify all examples work correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3, 4, 5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1: US1 → P1: US3 → P2: US2)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of other stories
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) - May reference US1 types but should be independently implementable

### Within Each User Story

**User Story 1**:
- T012-T013 (detector setup) can run in parallel
- T014-T018 must run sequentially (detection pipeline)
- T019-T022 (integration) must run after T012-T018
- T023-T027 (edge cases) can run after core implementation

**User Story 2**:
- T028-T031 must run sequentially (profiler updates)
- T032-T035 can run in parallel after T028-T031

**User Story 3**:
- T036-T041 (key generation) can run in parallel
- T042-T044 (preprocessing) must run sequentially
- T045-T048 (edge cases) can run after core implementation

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel
- **Phase 2**: T006 and T007 can run in parallel, T009 and T010 can run in parallel, T010 and T011 can run in parallel
- **User Story 1**: T012 and T013 can run in parallel
- **User Story 3**: T036 and T037 can run in parallel
- **Polish**: T049-T055 (unit tests), T056-T058 (validation), T060-T061 (documentation) can all run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch detector scaffolding in parallel:
Task: "Create dynamic key detector in src/lib/inferencer/dynamic-key-detector.ts with analyzeObjectKeys function"
Task: "Implement key counting logic in src/lib/inferencer/dynamic-key-detector.ts with countUniqueKeys function"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 3)

Since both US1 and US3 are P1 priority and together form the core dynamic key feature:

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Detection)
4. Complete Phase 5: User Story 3 (Generation)
5. **STOP and VALIDATE**: Test end-to-end dynamic key inference + generation
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Schema inference works
3. Add User Story 3 → Test independently → Generation works → **MVP COMPLETE**
4. Add User Story 2 → Test independently → Array optimization works
5. Add Polish → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (inference)
   - Developer B: User Story 3 (generation)
   - Developer C: User Story 2 (array optimization)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MVP = User Story 1 + User Story 3 (core dynamic key feature)
- User Story 2 is independent optimization that can be added later
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
