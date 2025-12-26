# Tasks: Synthetic MongoDB Document Generator

**Feature**: 001-mongodb-doc-gen
**Date**: 2025-12-26
**Status**: Ready for Implementation

---

## Task Summary

**Total Tasks**: 87
- **Phase 1 (Setup)**: 6 tasks
- **Phase 2 (Foundational)**: 15 tasks
- **Phase 3 (US1: Size-Equivalent Data)**: 18 tasks
- **Phase 4 (US2: Seed Control)**: 6 tasks
- **Phase 5 (US3: Schema Discovery)**: 13 tasks
- **Phase 6 (US4: MongoDB Insertion)**: 8 tasks
- **Phase 7 (US5: Custom Generators)**: 9 tasks
- **Phase 8 (US6: Validation)**: 12 tasks

**MVP Scope Recommendation**: Phase 1 + Phase 2 + Phase 3 + Phase 4 (45 tasks)
- Delivers US1 (Size-Equivalent Data) + US2 (Seed Control)
- Provides immediate value: deterministic, size-preserving synthetic document generation
- US3-US6 are enhancements that build on this foundation

---

## How to Use This File

### Task Format

Each task follows this format:
```
- [ ] [TaskID] [P?] [Story?] Description with file path
```

- **TaskID**: Sequential identifier (T001, T002, etc.)
- **[P] marker**: Indicates task can be parallelized with others in the same phase (different files, no dependencies)
- **[Story] label**: User story reference (e.g., [US1], [US2]) for traceability
- **Description**: Clear action with exact file path from plan.md structure

### Marking Tasks Complete

Use standard markdown checkbox syntax:
```
- [x] [T001] Task description...
```

### Parallel Execution

Tasks marked `[P]` within the same phase can be executed in parallel. Example:
```
- [ ] [T010] [P] Create sampler types → src/lib/sampler/types.ts
- [ ] [T011] [P] Create normalizer types → src/lib/normalizer/types.ts
```

**Guidelines**:
- Only tasks touching different files/modules are marked `[P]`
- Tasks in different phases are implicitly sequential (complete all Phase N before Phase N+1)
- Within a phase, unmarked tasks have dependencies on prior tasks in that phase

---

## Phase 1: Project Setup

**Goal**: Initialize TypeScript project with tooling, dependencies, and base configuration

### Tasks

- [ ] [T001] Initialize npm project with package.json (name: mongoforge, version: 0.1.0)
- [ ] [T002] Install core dependencies (mongodb, mongodb-schema, json-schema-faker, @faker-js/faker, ajv, commander, ndjson)
- [ ] [T003] Install dev dependencies (@types/node, typescript, vitest, tsx, tsup, mongodb-memory-server)
- [ ] [T004] Create tsconfig.json (strict mode, ES2022 target, node module resolution) → tsconfig.json
- [ ] [T005] Create vitest.config.ts (coverage thresholds >80%, test patterns) → vitest.config.ts
- [ ] [T006] [P] Create .gitignore (node_modules, dist, coverage, output, *.ndjson) → .gitignore

**Dependencies**: None (foundation tasks)

**Completion Criteria**: `npm install` succeeds, `tsc --noEmit` validates config, `vitest` runs (no tests yet)

---

## Phase 2: Foundational Infrastructure

**Goal**: Build shared utilities, types, and core abstractions required by all user stories

### Tasks

- [ ] [T007] [P] Create shared type definitions index → src/types/index.ts
- [ ] [T008] [P] Create core data model types (SampleDocument, NormalizedDocument, InferredSchema, GenerationSchema, ConstraintsProfile, RunManifest, ValidationReport) → src/types/data-model.ts
- [ ] [T009] [P] Create configuration types (SourceConfig, SamplingConfig, ConstraintsConfig, GenerationConfig, OutputConfig) → src/types/config.ts
- [ ] [T010] [P] Create logger utility (structured logging with levels: error, warn, info, debug) → src/utils/logger.ts
- [ ] [T011] [P] Create seed manager utility (hash seed strings to numbers, expose seeding API) → src/utils/seed-manager.ts
- [ ] [T012] [P] Create MongoDB connector utility (connection pooling, authentication, error handling) → src/lib/sampler/connector.ts
- [ ] [T013] [P] Create sampler module types → src/lib/sampler/types.ts
- [ ] [T014] [P] Create normalizer module types → src/lib/normalizer/types.ts
- [ ] [T015] [P] Create inferencer module types → src/lib/inferencer/types.ts
- [ ] [T016] [P] Create synthesizer module types → src/lib/synthesizer/types.ts
- [ ] [T017] [P] Create profiler module types → src/lib/profiler/types.ts
- [ ] [T018] [P] Create generator module types → src/lib/generator/types.ts
- [ ] [T019] [P] Create emitter module types → src/lib/emitter/types.ts
- [ ] [T020] [P] Create validator module types → src/lib/validator/types.ts
- [ ] [T021] [P] Create reporter module types → src/lib/reporter/types.ts

**Dependencies**: Phase 1 complete

**Completion Criteria**: All type files compile, no TypeScript errors, base utilities have unit tests

**Parallel Execution Example**: T007-T021 can all run in parallel (different files, no dependencies)

---

## Phase 3: User Story 1 - Size-Equivalent Test Data (P1)

**Goal**: Generate synthetic documents preserving array lengths, nested structure depth, and document size characteristics

### Tasks (Discovery → Profiling)

- [ ] [T022] [US1] Implement MongoDB connection in connector → src/lib/sampler/connector.ts
- [ ] [T023] [US1] Implement random sampling strategy → src/lib/sampler/strategies.ts
- [ ] [T024] [US1] [P] Implement first-N sampling strategy → src/lib/sampler/strategies.ts
- [ ] [T025] [US1] [P] Implement time-windowed sampling strategy → src/lib/sampler/strategies.ts
- [ ] [T026] [US1] Create sampler module index (orchestrates sampling strategies) → src/lib/sampler/index.ts

### Tasks (Normalization)

- [ ] [T027] [US1] Implement ObjectId → string normalization → src/lib/normalizer/type-mappers.ts
- [ ] [T028] [US1] [P] Implement Date → ISO 8601 string normalization → src/lib/normalizer/type-mappers.ts
- [ ] [T029] [US1] [P] Implement Decimal128 → string normalization → src/lib/normalizer/type-mappers.ts
- [ ] [T030] [US1] [P] Implement BinData → base64 string normalization → src/lib/normalizer/type-mappers.ts
- [ ] [T031] [US1] Create normalizer module index (orchestrates type mapping with __typeHints) → src/lib/normalizer/index.ts

### Tasks (Profiling for Size/Array Constraints)

- [ ] [T032] [US1] Implement array length statistics extraction (minLen, maxLen, p50, p90, p99) → src/lib/profiler/array-stats.ts
- [ ] [T033] [US1] Implement document size bucket calculation (leafFieldCount proxy) → src/lib/profiler/size-buckets.ts
- [ ] [T034] [US1] [P] Implement percentile-based array length clamping logic → src/lib/profiler/array-stats.ts
- [ ] [T035] [US1] Create profiler module index (produces ConstraintsProfile) → src/lib/profiler/index.ts

### Tasks (Generation Core)

- [ ] [T036] [US1] Implement json-schema-faker initialization with @faker-js/faker provider → src/lib/generator/faker-engine.ts
- [ ] [T037] [US1] Implement ObjectId custom format generator → src/lib/generator/custom-formats.ts
- [ ] [T038] [US1] [P] Implement date-time custom format generator → src/lib/generator/custom-formats.ts
- [ ] [T039] [US1] Create streaming generation logic (Readable stream yielding synthetic docs) → src/lib/generator/stream.ts

**Dependencies**: Phase 2 complete

**Completion Criteria**:
- Can sample MongoDB collection → normalize types → extract array stats + size buckets
- Can generate synthetic documents matching array length distributions (within 10% p50/p90/p99)
- Generated documents have similar size distribution (within 20% per bucket)

---

## Phase 4: User Story 2 - Repeatable Generation with Seed Control (P1)

**Goal**: Enable deterministic, byte-identical output across runs using seed values

### Tasks

- [ ] [T040] [US2] Implement seed hashing for string seeds (SHA-256 → numeric seed) → src/utils/seed-manager.ts
- [ ] [T041] [US2] Integrate seed into faker engine initialization (faker.seed(numericSeed)) → src/lib/generator/faker-engine.ts
- [ ] [T042] [US2] Create run manifest generator (version, seed, hashes, timestamps) → src/lib/reporter/index.ts
- [ ] [T043] [US2] Implement manifest serialization (JSON output with artifact hashes) → src/lib/reporter/index.ts
- [ ] [T044] [US2] Create integration test for repeatability (generate twice with same seed, compare byte-for-byte) → tests/integration/repeatability.test.ts
- [ ] [T045] [US2] Document seed in manifest with SHA-256 hashes of schema + constraints → src/lib/reporter/index.ts

**Dependencies**: Phase 3 complete (requires generator core)

**Completion Criteria**:
- Same seed + config produces identical NDJSON output (byte-for-byte)
- Different seeds produce different documents with same structure
- Run manifest includes seed and artifact hashes

---

## Phase 5: User Story 3 - Schema Discovery and Export (P2)

**Goal**: Sample collection and export inferred schema with generation constraints as JSON artifacts

### Tasks (Inference)

- [ ] [T046] [US3] Integrate mongodb-schema library for probabilistic inference → src/lib/inferencer/mongodb-schema-wrapper.ts
- [ ] [T047] [US3] Create inferencer module index (orchestrates mongodb-schema with normalized documents) → src/lib/inferencer/index.ts
- [ ] [T048] [US3] Implement field path extraction (JSONPath-style: "user.addresses[].city") → src/lib/inferencer/mongodb-schema-wrapper.ts

### Tasks (Schema Synthesis)

- [ ] [T049] [US3] Implement InferredSchema → GenerationSchema transformer (JSON Schema draft-07) → src/lib/synthesizer/index.ts
- [ ] [T050] [US3] Implement x-gen.key vendor keyword logic (uniqueness preference) → src/lib/synthesizer/vendor-keywords.ts
- [ ] [T051] [US3] [P] Implement x-gen.mongoType vendor keyword logic (original type annotation) → src/lib/synthesizer/vendor-keywords.ts
- [ ] [T052] [US3] [P] Implement x-gen.arrayLen vendor keyword logic (length constraints + strategy) → src/lib/synthesizer/vendor-keywords.ts
- [ ] [T053] [US3] Set minItems/maxItems for array schemas from profiler stats → src/lib/synthesizer/index.ts
- [ ] [T054] [US3] Generate required array (always includes "_id" + user-configured keys) → src/lib/synthesizer/index.ts

### Tasks (CLI infer command)

- [ ] [T055] [US3] Create CLI index with commander setup → src/cli/index.ts
- [ ] [T056] [US3] Implement infer command (args parsing, orchestration) → src/cli/commands/infer.ts
- [ ] [T057] [US3] Implement configuration file parser (JSON/YAML support) → src/cli/config/parser.ts
- [ ] [T058] [US3] Create CLI configuration types → src/cli/config/types.ts

**Dependencies**: Phase 2 complete (can run independently of US1/US2, but builds on foundation)

**Completion Criteria**:
- `mongoforge infer` produces 3 JSON files: inferred.schema.json, generation.schema.json, constraints.json
- Schemas capture field paths, types, optionality, array length stats
- Nested objects and arrays are correctly represented with JSONPath notation

---

## Phase 6: User Story 4 - Direct MongoDB Insertion (P2)

**Goal**: Insert synthetic documents directly into MongoDB with configurable batch operations

### Tasks

- [ ] [T059] [US4] Implement MongoDB bulk insert emitter (bulkWrite with configurable batch size) → src/lib/emitter/mongo-inserter.ts
- [ ] [T060] [US4] Implement write concern configuration (majority, acknowledged, etc.) → src/lib/emitter/mongo-inserter.ts
- [ ] [T061] [US4] [P] Implement ordered/unordered bulk insert modes → src/lib/emitter/mongo-inserter.ts
- [ ] [T062] [US4] Implement target collection naming strategy (suffix support: "_synthetic") → src/lib/emitter/mongo-inserter.ts
- [ ] [T063] [US4] Create emitter module index (orchestrates file writers + mongo inserter) → src/lib/emitter/index.ts
- [ ] [T064] [US4] Add MongoDB insertion mode to generate command (--target-uri flags) → src/cli/commands/generate.ts
- [ ] [T065] [US4] Implement backpressure handling for MongoDB writes in stream pipeline → src/lib/emitter/mongo-inserter.ts
- [ ] [T066] [US4] Create integration test for MongoDB insertion (verify batch writes, count) → tests/integration/mongo-insertion.test.ts

**Dependencies**: Phase 3 complete (requires generator stream), Phase 5 complete (requires CLI infrastructure)

**Completion Criteria**:
- `mongoforge generate` with `--target-uri` inserts documents into MongoDB
- Batch size configurable (default 1000)
- Write concern and ordered/unordered modes work correctly

---

## Phase 7: User Story 5 - Custom Field Value Generators (P3)

**Goal**: Override default generation for specific field paths or types with custom logic

### Tasks

- [ ] [T067] [US5] Implement custom generator registration API (path-based overrides) → src/lib/generator/custom-formats.ts
- [ ] [T068] [US5] Implement type-based custom generator registration → src/lib/generator/custom-formats.ts
- [ ] [T069] [US5] Implement precedence logic (path-specific > type-level > default) → src/lib/generator/custom-formats.ts
- [ ] [T070] [US5] Create custom generator module loader (JavaScript file import) → src/cli/commands/generate.ts
- [ ] [T071] [US5] Implement email custom format generator (valid email patterns) → src/lib/generator/custom-formats.ts
- [ ] [T072] [US5] [P] Implement UUID custom format generator (v4 UUIDs) → src/lib/generator/custom-formats.ts
- [ ] [T073] [US5] [P] Implement ObjectId with timestamp prefix custom generator → src/lib/generator/custom-formats.ts
- [ ] [T074] [US5] Add --custom-generators flag to generate command → src/cli/commands/generate.ts
- [ ] [T075] [US5] Create integration test for custom generators (verify override logic) → tests/integration/custom-generators.test.ts

**Dependencies**: Phase 4 complete (requires generator core), Phase 5 complete (requires CLI)

**Completion Criteria**:
- Custom generator functions can override defaults for specific paths
- Path-specific overrides take precedence over type-level overrides
- Custom generators loaded from JavaScript module file

---

## Phase 8: User Story 6 - Validation and Quality Reports (P3)

**Goal**: Validate generated documents and produce quality reports comparing sample vs generated data

### Tasks (Schema Validation)

- [ ] [T076] [US6] Implement Ajv-based JSON Schema validator integration → src/lib/validator/schema-validator.ts
- [ ] [T077] [US6] Implement schema conformance checker (validate all docs, collect violations) → src/lib/validator/schema-validator.ts
- [ ] [T078] [US6] Implement uniqueness checker for _id field → src/lib/validator/schema-validator.ts
- [ ] [T079] [US6] [P] Implement uniqueness checker for additional key fields → src/lib/validator/schema-validator.ts

### Tasks (Quality Reporting)

- [ ] [T080] [US6] Implement array length histogram comparison (sample vs generated) → src/lib/validator/quality-reporter.ts
- [ ] [T081] [US6] Implement document size distribution comparison → src/lib/validator/quality-reporter.ts
- [ ] [T082] [US6] Implement deviation calculation with tolerance thresholds (10% array, 20% size) → src/lib/validator/quality-reporter.ts
- [ ] [T083] [US6] Create validator module index (orchestrates validation + quality reporting) → src/lib/validator/index.ts

### Tasks (CLI validate command)

- [ ] [T084] [US6] Implement validate command (args parsing, orchestration) → src/cli/commands/validate.ts
- [ ] [T085] [US6] Implement NDJSON input reader (file or stdin) → src/cli/commands/validate.ts
- [ ] [T086] [US6] Implement validation report serializer (JSON output) → src/cli/commands/validate.ts
- [ ] [T087] [US6] Create integration test for validation workflow (generate → validate) → tests/integration/validation-workflow.test.ts

**Dependencies**: Phase 4 complete (requires generator + manifest), Phase 5 complete (requires CLI)

**Completion Criteria**:
- `mongoforge validate` produces ValidationReport JSON
- Reports schema conformance rate (100% expected for valid generation)
- Reports array length and document size deviations with pass/fail flags

---

## Cross-Cutting Tasks (Deferred to Polishing)

These tasks span multiple phases and should be completed as final polish:

### Documentation
- [ ] [T088] Create README.md with installation, usage examples, CLI reference → README.md
- [ ] [T089] Create CHANGELOG.md with version history → CHANGELOG.md
- [ ] [T090] Document MongoDB type mappings in README → README.md

### Testing
- [ ] [T091] Create end-to-end integration test (infer → generate → validate) → tests/integration/end-to-end.test.ts
- [ ] [T092] Add CLI contract tests for all commands → tests/contract/

### Build & Distribution
- [ ] [T093] Create tsup build configuration (ESM + CJS outputs) → tsup.config.ts
- [ ] [T094] Add npm scripts (build, test, dev, lint) → package.json
- [ ] [T095] Configure npm package exports (bin: mongoforge) → package.json

### Security & CI
- [ ] [T096] Create GitHub Actions workflow (npm audit, vitest, coverage) → .github/workflows/ci.yml
- [ ] [T097] Configure Renovate or Dependabot for dependency updates → .github/renovate.json

---

## Implementation Notes

### Dependency Relationships

**Critical Path**:
1. Phase 1 (Setup) → Phase 2 (Foundation) → Phase 3 (US1) → Phase 4 (US2)
   - This is the MVP: deterministic, size-preserving synthetic data generation

**Independent Branches** (after Phase 2):
- Phase 5 (US3) can start after Phase 2 (builds schema export, doesn't need generation)
- Phase 6 (US4) requires Phase 3 + Phase 5 (needs generator stream + CLI)
- Phase 7 (US5) requires Phase 4 + Phase 5 (needs generator core + CLI)
- Phase 8 (US6) requires Phase 4 + Phase 5 (needs generated docs + CLI)

**Parallelization Strategy**:
- Within each phase, tasks marked `[P]` can run in parallel
- Example: In Phase 2, all type definition tasks (T007-T021) are independent
- Example: In Phase 3, normalization tasks (T027-T030) can run in parallel

### Testing Strategy

**Unit Tests** (alongside implementation):
- Each module task should include unit tests in corresponding `tests/unit/` directory
- Example: T032 (array-stats.ts) → create `tests/unit/profiler/array-stats.test.ts`

**Integration Tests** (per phase):
- T044: Repeatability test (Phase 4)
- T066: MongoDB insertion test (Phase 6)
- T075: Custom generators test (Phase 7)
- T087: Validation workflow test (Phase 8)
- T091: End-to-end test (final polish)

**Contract Tests** (CLI commands):
- T092: Create contract tests for infer, generate, validate commands
- Verify stdout/stderr output formats, exit codes

### Performance Checkpoints

Add performance validation at these milestones:
- After Phase 3: Verify 10k docs/sec generation throughput (SC-003)
- After Phase 4: Verify <2GB memory for 1M docs (SC-007)
- After Phase 6: Verify MongoDB insertion throughput with batch writes

### Quality Gates

Before marking a phase complete:
1. All tasks in phase have passing unit tests
2. TypeScript compiles with no errors (`tsc --noEmit`)
3. Vitest coverage >80% for new code
4. Integration tests for phase pass
5. No regressions in prior phase tests

---

## Task Assignment Guidelines

### For Solo Implementation
- Complete phases sequentially (Phase 1 → Phase 2 → Phase 3 → ...)
- Within a phase, tackle unmarked tasks in order (dependencies)
- Parallelize `[P]` tasks if context-switching is efficient

### For Team Implementation
- Assign phases to team members based on expertise:
  - **Database specialist**: Phases 1-2, Phase 3 (sampling/profiling), Phase 6 (insertion)
  - **Schema/type specialist**: Phase 3 (normalization), Phase 5 (inference/synthesis)
  - **Generator specialist**: Phase 3 (generation), Phase 4 (seeding), Phase 7 (custom generators)
  - **Testing specialist**: Phase 8 (validation), cross-cutting testing tasks
- Use `[P]` markers to identify tasks that can run in parallel across team members

### For AI-Assisted Implementation
- Provide tasks with `[US#]` labels to maintain user story context
- Use task descriptions with exact file paths for clear scope
- Reference data-model.md and contracts/cli-commands.md for implementation details

---

## MVP Scope (Phases 1-4)

**Recommended First Deliverable**: Phases 1 + 2 + 3 + 4 (45 tasks)

**Capabilities Delivered**:
- ✅ Sample MongoDB collection
- ✅ Normalize MongoDB types to JSON Schema
- ✅ Extract array length + document size statistics
- ✅ Generate synthetic documents preserving structural characteristics
- ✅ Deterministic generation with seed control (repeatability)
- ✅ Stream output to NDJSON files
- ✅ Run manifests for auditability

**What's Missing** (deferred to Phases 5-8):
- Schema discovery CLI command (can still generate, just no `mongoforge infer`)
- Direct MongoDB insertion (use NDJSON + mongoimport workaround)
- Custom generators (default random generation only)
- Validation command (manual spot-checking instead)

**User Value**:
- Immediate: Generate 100k+ synthetic documents matching production structure/size
- Immediate: Repeatable tests with seed-controlled generation
- Deferred (acceptable): Schema visibility, direct insertion, custom patterns, automated validation

---

## Progress Tracking

**Completion Formula**: (Completed Tasks / Total Tasks) × 100%

**Phase Completion**:
- Phase 1: 0/6 (0%)
- Phase 2: 0/15 (0%)
- Phase 3: 0/18 (0%)
- Phase 4: 0/6 (0%)
- Phase 5: 0/13 (0%)
- Phase 6: 0/8 (0%)
- Phase 7: 0/9 (0%)
- Phase 8: 0/12 (0%)

**Overall Progress**: 0/87 (0%)

**MVP Progress** (Phases 1-4): 0/45 (0%)

---

## Next Steps

1. **Review this tasks.md** with stakeholders for scope agreement
2. **Begin Phase 1** (project setup): Initialize npm, install dependencies, configure TypeScript
3. **Complete Phase 2** (foundation): Build shared types, utilities, module skeletons
4. **Implement MVP** (Phases 3-4): Core generation with size/structure preservation + seed control
5. **Iterate on P2/P3 features** (Phases 5-8): Schema discovery, insertion, custom generators, validation

---

**Tasks Sign-off**: 87 tasks defined across 8 phases. MVP scope (45 tasks) delivers US1 + US2. Ready for implementation.
