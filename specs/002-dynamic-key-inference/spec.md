# Feature Specification: Dynamic Key Inference & Optimized Array Length Storage

**Feature Branch**: `002-dynamic-key-inference`
**Created**: 2025-12-26
**Status**: Draft
**Input**: User description: "In our MongoDB instance, there are documents which have string keys where the string keys themselves are things like UUIDs or account IDs. In these instances, our count, our inferred schema just blows up. What we need to be able to do is say that beyond a certain number of distinct string keys within a nested complex object if it exceeds a certain threshold, we need to make our inference assume that the key is some sort of ID. We need to be able to store and understand the properties of that ID, though that's not as important. Then, during the generation of synthetic documents, we need to honestly almost treat it like an array in so much as like we figure out how many distinct keys or the count of keys that are typically present, and then when we generate synthetic documents, we use synthetic keys within ranges of that count that we've seen. We have similar handling for arrays as it would be here, so we need to support this, and it's incredibly important because otherwise our schemas are just ridiculous.

While we're looking at this, we should improve how we handle variable-length arrays, too, because I believe in the artifacts that we produce, we store every single length in just a giant array in one of those artifacts, and I feel like we should probably just use a mapping where we store the length of one occurred a hundred times, length of two occurred fifty times, that sort of thing.

So let's make sure that we factor in that there's similarities here in how we're handling these or how we should be handling these, and let's try to make the code clean."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Schema Inference with Dynamic Key Detection (Priority: P1)

When analyzing MongoDB collections that contain objects with highly variable string keys (e.g., UUIDs, account IDs used as object keys), the schema inference process must recognize this pattern and avoid creating bloated schemas with thousands of individual key definitions.

**Why this priority**: This is the core issue blocking effective schema inference for real-world MongoDB documents. Without this, schemas become unusable and the entire tool fails for collections with dynamic keys.

**Independent Test**: Can be fully tested by running schema inference on a collection containing objects with 50+ distinct UUID-based keys and verifying the schema represents this as a dynamic key pattern rather than individual key entries.

**Acceptance Scenarios**:

1. **Given** a MongoDB collection with documents containing nested objects where keys are UUIDs, **When** schema inference runs, **Then** the system detects that the number of distinct keys exceeds the threshold and marks the object as having dynamic keys
2. **Given** an object with dynamic keys identified during inference, **When** the schema is generated, **Then** the schema stores key pattern characteristics (count distribution, value types) instead of individual key definitions
3. **Given** a schema with dynamic key patterns, **When** synthetic documents are generated, **Then** documents contain a realistic number of synthetic keys matching the observed count distribution

---

### User Story 2 - Array Length Distribution Storage Optimization (Priority: P2)

When analyzing collections with variable-length arrays, the schema storage must efficiently represent array length distributions as frequency maps rather than storing every observed length value individually.

**Why this priority**: This optimizes storage and improves clarity, making schemas more maintainable. While important, it's secondary to fixing the dynamic key bloat issue.

**Independent Test**: Can be tested by running schema inference on a collection with arrays of varying lengths (1-100 elements) and verifying the schema artifact stores length distribution as `{1: 50, 2: 30, 3: 20}` format rather than `[1,1,1,...,2,2,...]`.

**Acceptance Scenarios**:

1. **Given** a collection with arrays of varying lengths, **When** schema inference analyzes the data, **Then** array length occurrences are aggregated into a frequency map
2. **Given** a schema with array length distribution data, **When** synthetic documents are generated, **Then** array lengths are selected based on the observed distribution frequencies
3. **Given** array length data stored as a frequency map, **When** the schema artifact is inspected, **Then** the file size is significantly smaller than the previous array-based storage

---

### User Story 3 - Synthetic Document Generation with Dynamic Keys (Priority: P1)

When generating synthetic documents from schemas containing dynamic key patterns, the generator must produce documents with realistic key counts and synthetic key names that match the inferred pattern characteristics.

**Why this priority**: This is the second half of the core functionality - inference is useless without proper generation. Both must work together for the feature to deliver value.

**Independent Test**: Can be tested by generating synthetic documents from a schema with dynamic key patterns and verifying that generated objects contain the correct number of keys (within observed ranges) with appropriately formatted synthetic key names.

**Acceptance Scenarios**:

1. **Given** a schema with dynamic key pattern (e.g., UUID format, count range 10-50), **When** synthetic documents are generated, **Then** each document contains between 10-50 keys with UUID-formatted synthetic names
2. **Given** dynamic key value type information in the schema, **When** synthetic documents are generated, **Then** the values associated with synthetic keys match the observed type patterns
3. **Given** multiple documents generated from the same dynamic key schema, **When** reviewing the synthetic keys, **Then** keys are unique across documents (no collision) and follow the same format pattern

---

### Edge Cases

- What happens when an object has exactly the threshold number of distinct keys (e.g., 50 keys when threshold is 50)?
- How does the system differentiate between legitimate distinct keys (e.g., "firstName", "lastName") versus dynamic keys (e.g., UUID-based)?
- What happens when dynamic keys have mixed value types (e.g., some UUIDs map to objects, others to strings)?
- How are nested dynamic key structures handled (dynamic keys within dynamic keys)?
- What happens when array length distributions are highly sparse (e.g., lengths of 1, 5, 100 with no values in between)?
- How does the system handle collections where some documents have dynamic keys and others have static keys for the same nested path?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect when the number of distinct string keys in a nested object exceeds a configurable threshold during schema inference
- **FR-002**: System MUST store dynamic key pattern metadata including: key count distribution (min, max, median), key format characteristics, and value type distribution
- **FR-003**: System MUST distinguish between static keys (fixed property names) and dynamic keys (ID-based or variable property names) using a combination of count threshold and key format pattern detection (UUID regex, numeric ID patterns, consistent prefixes)
- **FR-004**: System MUST generate synthetic documents with realistic key counts matching the observed distribution when dynamic key patterns are present
- **FR-005**: System MUST generate synthetic key names that match the format characteristics of observed dynamic keys (e.g., UUID format, numeric IDs)
- **FR-006**: System MUST store array length distributions as frequency maps (length → occurrence count) instead of individual length values
- **FR-007**: System MUST use array length distribution data to generate arrays with realistic length variation during synthetic document generation
- **FR-008**: System MUST maintain consistent storage patterns between dynamic key count distributions and array length distributions for code clarity and maintainability
- **FR-009**: System MUST allow configuration of the dynamic key detection threshold (number of distinct keys triggering dynamic key treatment)
- **FR-010**: System MUST preserve existing schema inference behavior for objects with key counts below the dynamic key threshold

### Key Entities *(include if feature involves data)*

- **Dynamic Key Pattern**: Represents a detected pattern of variable keys in a nested object, including count distribution statistics, key format patterns, and value type information
- **Length Distribution**: Represents the frequency distribution of array lengths or dynamic key counts, stored as a map of value to occurrence count
- **Schema Artifact**: The persisted schema metadata that now includes dynamic key patterns and optimized length distributions instead of exhaustive key enumerations

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Schema artifact file size is reduced by at least 90% for collections with objects containing more than 100 distinct dynamic keys
- **SC-002**: Schema inference completes within the same time bounds as before (no more than 10% slowdown) even with dynamic key detection enabled
- **SC-003**: Generated synthetic documents contain key counts within the observed min/max range for 95% of generated documents
- **SC-004**: Generated synthetic documents maintain the same structural fidelity to source documents as the current implementation for non-dynamic-key scenarios
- **SC-005**: Array length distribution storage reduces artifact size by at least 50% for collections with high array length variability (>20 distinct lengths)

## Assumptions

- This is a greenfield implementation with no legacy artifacts to migrate
- Dynamic keys typically follow identifiable patterns (UUID, numeric IDs, account identifiers) that can be detected programmatically using regex and format analysis
- The dynamic key detection threshold is configurable (default: 50 distinct keys triggers dynamic key treatment when combined with format pattern matching)
- Synthetic key generation can leverage existing random data generation utilities for format-appropriate values
- The codebase has a clear separation between schema inference and document generation phases
- Array length distribution and dynamic key count distribution can share common storage and utility code for consistency

## Out of Scope

- Automatic detection of semantic meaning of dynamic keys (e.g., recognizing that keys represent user IDs vs transaction IDs)
- UI or visualization changes for displaying dynamic key patterns
- Performance optimization of the inference algorithm beyond maintaining current performance levels
- Support for non-string dynamic keys (e.g., numeric keys in JavaScript objects)
- Machine learning-based key pattern detection (using rule-based heuristics instead)
