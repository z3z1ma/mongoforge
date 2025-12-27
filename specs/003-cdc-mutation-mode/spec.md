# Feature Specification: CDC and Mutation Modes

**Feature Branch**: `003-cdc-mutation-mode`  
**Created**: 2025-12-27  
**Status**: Draft  
**Input**: User description provided via CLI

## Overview

This specification defines two new operational modes for `mongoforge` to support Change Data Capture (CDC) load testing:

1.  **Mutation Mode (`mutate`)**: A two-phase workflow that performs mutations (updates/deletes) on *existing* MongoDB collections.
2.  **CDC Mode (`generate --output mongo-cdc`)**: A single-pass mixed operation stream (inserts + updates + deletes) directly against a MongoDB target.

Both modes execute operations directly against a MongoDB instance rather than producing output files.

## User Scenarios & Testing

### User Story 1 - Mutation Mode for Existing Data (Priority: P1)

As a QA Engineer, I want to run a configurable stream of updates and deletes against a pre-populated MongoDB collection so that I can validate downstream CDC pipelines (e.g., Debezium, Kafka Connect) handling realistic modification patterns.

**Why this priority**: Essential for testing CDC connectors against baseline data without requiring data regeneration.

**Independent Test**: Can be tested by running `mongoforge mutate` against a local MongoDB instance populated with test data and verifying the `oplog` or collection state changes.

**Acceptance Scenarios**:

1.  **Given** a collection with 10,000 documents, **When** executing `mutate` with `--count 1000` and default ratios, **Then** approximately 700 updates and 300 deletes are performed against existing documents.
2.  **Given** a running mutation job, **When** `--delete-tracking memory` is enabled, **Then** the system MUST NOT attempt to update or delete a document ID that it has already deleted in the current session.
3.  **Given** an existing collection, **When** using `--update-strategy regenerate` with a schema, **Then** documents are updated with new valid data conforming to the schema.

---

### User Story 2 - CDC Simulation Mode (Priority: P1)

As a Developer, I want to generate a continuous stream of interleaved inserts, updates, and deletes so that I can simulate "live" application traffic for performance testing and system stability analysis.

**Why this priority**: Enables realistic load testing where data grows and churns simultaneously, which is critical for testing indexing strategies and database performance over time.

**Independent Test**: Can be tested by running `mongoforge generate --output mongo-cdc` and observing the database statistics (document count fluctuation) and operation distribution.

**Acceptance Scenarios**:

1.  **Given** a schema, **When** running with `--output mongo-cdc` and `--operation-ratios insert:50,update:50`, **Then** the system performs a mix of inserts and updates.
2.  **Given** the CDC mode running, **When** an update operation is selected, **Then** it MUST target a document ID that was previously inserted by the current session (from the ID cache).
3.  **Given** a `--id-cache-size` limit, **When** the cache fills up, **Then** older IDs are evicted and no longer targeted for updates, simulating "hot" data access patterns.

---

### User Story 3 - Controlled Deletion Handling (Priority: P2)

As a DevOps Engineer, I want to control how deletes are handled (e.g., tombstoning vs. actual removal) so that I can test different logical deletion patterns used in my application.

**Why this priority**: Applications handle deletes differently (soft vs hard), and the load generator must match the application behavior to be useful.

**Independent Test**: run `mongo-cdc` with `--delete-behavior tombstone`.

**Acceptance Scenarios**:

1.  **Given** CDC mode with `--delete-behavior tombstone`, **When** a "delete" operation occurs, **Then** the document is NOT removed from MongoDB but effectively "marked" (or treated as deleted logic), and remains in the cache for potential "resurrection" if supported, or ignored. *(Refinement based on specs: The spec says "Mark as deleted but keep in cache". Actual implementation might update a `deleted: true` flag if schema supports it, or just keep it in cache for race condition testing. For this spec, we adhere to the behavior: "keep in cache").*

---

### User Story 4 - Throttled Execution (Priority: P2)

As a Performance Engineer, I want to limit the rate of operations (ops/sec) so that I can create a predictable load that doesn't overwhelm the target database or the downstream CDC consumers.

**Why this priority**: Uncontrolled load generation acts like a denial-of-service attack; realistic testing requires controlled throughput.

**Independent Test**: Run with `--rate-limit 100`.

**Acceptance Scenarios**:

1.  **Given** a configured `--rate-limit 100`, **When** the tool runs, **Then** the average throughput over a 10-second window MUST NOT exceed 100 operations per second (+/- 10%).

## Requirements

### Functional Requirements

#### General
- **FR-001**: System MUST connect to a target MongoDB instance via URI (`--uri`).
- **FR-002**: System MUST validate that the target collection exists and is accessible.
- **FR-003**: System MUST support `bulkWrite` operations with configurable batch sizes (`--batch-size`) for performance.
- **FR-004**: System MUST report real-time metrics (ops/sec, counts by type) to the console (`--metrics-interval`).
- **FR-005**: System MUST support rate limiting (`--rate-limit`) to throttle execution speed.

#### Mutation Mode (`mutate`)
- **FR-006**: System MUST verify the target collection is non-empty before starting.
- **FR-007**: System MUST support a `mutate` command that accepts a `--ratio` of operations (e.g., `update:70,delete:30`).
- **FR-008**: System MUST support configurable sampling strategies: `random` (default), `sequential`, `weighted-recent`.
- **FR-009**: System MUST support configurable update strategies:
    - `regenerate`: Re-create fields using the schema.
    - `partial`: Update a subset of fields.
    - `increment`: Increment numeric values.
    - `mixed`: Random combination.
- **FR-010**: System MUST support delete tracking (`none`, `memory`, `filter`) to avoid operating on already-deleted documents.

#### CDC Mode (`generate --output mongo-cdc`)
- **FR-011**: System MUST support a new output target `mongo-cdc` for the `generate` command.
- **FR-012**: System MUST support a configurable mix of `insert`, `update`, and `delete` operations via `--operation-ratios`.
- **FR-013**: System MUST maintain an in-memory LRU cache of inserted Document IDs (`--id-cache-size`) to serve as targets for subsequent update/delete operations.
- **FR-014**: System MUST support a "warmup" phase (`--warmup-inserts`) to populate the ID cache before mutations begin.
- **FR-015**: System MUST support configurable delete behaviors: `remove-from-cache` (default), `keep-in-cache`, `tombstone`.

### Edge Cases

- **Empty Collection**: If `mutate` is run against an empty collection, it should exit with a clear error or warning immediately.
- **Connection Loss**: If the MongoDB connection is lost, the tool should attempt to reconnect (if configured) or fail gracefully with a final metrics report.
- **Cache Overflow**: In CDC mode, if the number of inserted documents exceeds `--id-cache-size`, the oldest IDs are evicted. Updates attempting to target evicted IDs (if randomly generated outside cache) would fail, but the design restricts updates to *cached* IDs, ensuring validity.
- **Invalid Schema**: If a schema is required for regeneration but is invalid/missing, the tool must fail fast at startup.

### Assumptions & Dependencies

- **MongoDB Access**: User has read/write permissions to the target database and collection.
- **Memory**: The host machine has sufficient RAM to store the `DocumentIDCache` (e.g., ~10-20MB for 100k ObjectIds).
- **Network**: Network latency to the MongoDB instance is stable; high latency may affect ability to meet high throughput targets.

### Key Entities

- **DocumentIDCache**: An in-memory structure holding ObjectIds of documents known to exist in the target (inserted by the tool).
- **OperationSelector**: A weighted random selector that determines the next operation type (Insert/Update/Delete).
- **MutationGenerator**: Logic that constructs a MongoDB update document (`$set`, `$inc`, etc.) based on a strategy and/or schema.

## Success Criteria

### Measurable Outcomes

- **SC-001**: **Throughput Accuracy**: The observed throughput matches the requested `--rate-limit` within 10% variance (when system resources allow).
- **SC-002**: **Ratio Adherence**: The final distribution of operations matches the requested `--ratio` or `--operation-ratios` within 5% variance for runs > 10,000 operations.
- **SC-003**: **Target Validity**: In CDC mode, >99% of update operations target documents that actually exist in the database (assuming no external interference).
- **SC-004**: **Performance**: The tool can sustain at least 1,000 operations per second on standard hardware (assuming local MongoDB) without memory leaks.