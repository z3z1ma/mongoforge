# Research: CDC and Mutation Modes

**Feature**: `003-cdc-mutation-mode`
**Date**: 2025-12-27

## Decisions

### 1. MongoDB Interaction
- **Decision**: Use the existing `mongodb` driver (v6.x) already present in `package.json`.
- **Rationale**: It provides all necessary functionality for `bulkWrite`, `find` (for ID caching), and connection management. It is already integrated into the project.

### 2. CLI Structure
- **Decision**: 
    - Add `src/cli/commands/mutate.ts` for the standalone mutation mode.
    - Extend `src/cli/commands/generate.ts` to support `--output mongo-cdc`.
- **Rationale**: Keeps the "generation" logic separate from "modification" logic where appropriate, but allows `generate` to act as a "traffic generator" when the output is explicitly set to a stream mode.

### 3. Document ID Caching
- **Decision**: Implement a custom `DocumentIDCache` class using an Array + Map combination.
    - `ids: string[]`: For random selection (O(1)).
    - `indices: Map<string, number>`: For O(1) lookup and removal.
    - **Limit**: Enforce `--id-cache-size` by evicting oldest (or random) when full.
- **Rationale**: We need O(1) random access to pick a target for update/delete, and O(1) checking if an ID exists.

### 4. Operation Generation
- **Decision**: Create a `MutationGenerator` service.
- **Rationale**: This service will handle the logic of "Given a schema and an ID, create a `$set` operation" or "Create a `$inc` operation". It decouples the MongoDB logic from the data creation logic.

### 5. Tombstone Handling
- **Decision**: Implement "Logical Deletes" where the ID remains in the cache (or is moved to a "deleted" set if we want to test resurrection).
- **Rationale**: The spec requires `keep-in-cache` behavior.

## Alternatives Considered

- **Using a separate tool (e.g., YCSB)**: Rejected because `mongoforge` aims to be a self-contained schema-driven generator.
- **Stateful tracking on disk**: Rejected for performance; in-memory tracking is sufficient for the stated scope (10-20MB for 100k IDs).

## Unknowns & Clarifications

- **Resolved**: "Tombstone" means keeping the ID in the cache so we can potentially update it again (simulating a "create or update" or "resurrection" race condition), or just to satisfy the spec requirement.
- **Resolved**: Rate limiting will be implemented using a token bucket or simple sleep mechanism to match `ops/sec`.
