# Refactor to Streaming Architecture - Scratchpad

## Goal
Refactor the system to be streaming by design to handle massive JSON objects and maximize performance. Move semantic detection to the streaming profiler.

## Current State
- `storeValues: true` is required for semantic type detection.
- `mongodb-schema` stores values, causing memory issues.
- `Inferencer` post-processes schema to find semantic types.
- `Generator` consumes the schema.

## Plan
1.  **Investigation**: Understand current implementations of Profiler, Inferencer, and SemanticDetector.
2.  **Semantic Accumulator**: Create a new accumulator in `src/lib/profiler/` for semantic stats.
3.  **Profiler Update**: Integrate `SemanticAccumulator` into `Profiler.observe`.
4.  **Synthesizer Update**: Use profiler stats for schema synthesis instead of post-processing.
5.  **Inferencer Refactor**: Remove reliance on `storeValues` for semantic types.
6.  **Streaming Generation**: Ensure the generation phase is also streaming.
7.  **Testing**: Verify with `mongoforge.local.yaml` and large documents.

## Progress
- [x] Investigation
- [x] Semantic Accumulator (`src/lib/profiler/semantic-stats.ts`)
- [x] Dynamic Key Accumulator (`src/lib/profiler/dynamic-key-stats.ts`)
- [x] Profiler Update (`src/lib/profiler/index.ts`)
- [x] Synthesizer Update (`src/lib/synthesizer/index.ts`)
- [x] Inferencer Refactor (`src/lib/inferencer/index.ts`)
- [x] CLI Update (`src/cli/commands/infer.ts`)
- [x] Test Fixes:
    - Updated `tests/integration/dynamic-keys-e2e.test.ts`
    - Updated `tests/integration/constraints-dynamic-keys.test.ts`
    - Updated `tests/integration/nested-dynamic-keys.test.ts`
- [x] Build Success
- [x] All Tests Passed
