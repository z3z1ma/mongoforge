# Feature Specification: Synthetic MongoDB Document Generator

**Feature Branch**: `001-mongodb-doc-gen`
**Created**: 2025-12-26
**Status**: Draft
**Input**: User description: "Synthetic MongoDB Document Generator — Schema-driven synthetic MongoDB document generation for high-volume CDC and load testing, preserving document structure and size characteristics without relying on production data."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Size-Equivalent Test Data (Priority: P1)

As a database engineer preparing for CDC testing, I need to generate synthetic MongoDB documents that match the size and structure of production data without accessing sensitive production records, so that I can load test our CDC pipeline with realistic document volumes and shapes.

**Why this priority**: This is the core value proposition - generating synthetic data that preserves structural characteristics (nested objects, array lengths, document size) is the foundation for realistic load testing. Without this, no other features matter.

**Independent Test**: Can be fully tested by providing a MongoDB collection URI with sample documents, running the generator to produce synthetic documents, and verifying that generated documents have similar array lengths, nested structure depth, and approximate byte size as the samples. Delivers immediate value by producing usable test data.

**Acceptance Scenarios**:

1. **Given** a MongoDB collection with 10,000 sample documents containing nested objects and arrays, **When** the generator infers schema and generates 100,000 synthetic documents, **Then** the synthetic documents have array lengths within the same min/max range as samples, preserve nested object structure, and have document sizes within 20% of sample distribution
2. **Given** a collection where a specific array path has lengths ranging from 5 to 50 elements with p90 at 30, **When** synthetic documents are generated, **Then** 90% of generated documents have that array with 30 or fewer elements
3. **Given** sample documents with specific MongoDB types (ObjectId, Date, Decimal128), **When** synthetic documents are generated, **Then** generated documents use appropriate type-equivalent values that maintain field type consistency

---

### User Story 2 - Repeatable Generation with Seed Control (Priority: P1)

As a QA engineer, I need to generate the exact same set of synthetic documents across multiple test runs using a seed value, so that I can reproduce test scenarios and debug issues consistently.

**Why this priority**: Repeatability is critical for debugging and regression testing. Without deterministic generation, teams cannot reproduce failures or validate fixes reliably.

**Independent Test**: Can be fully tested by running the generator twice with the same seed, configuration, and sample set, then comparing the output to verify byte-for-byte identical documents. Delivers immediate debugging and testing value.

**Acceptance Scenarios**:

1. **Given** a seed value of "test-seed-123" and a specific configuration, **When** the generator runs twice with the same parameters, **Then** both runs produce identical NDJSON output files that match byte-for-byte
2. **Given** two different seed values with identical configurations, **When** the generator runs with each seed, **Then** the output documents differ but both maintain the same structural and size constraints

---

### User Story 3 - Schema Discovery and Export (Priority: P2)

As a data engineer, I need to sample a MongoDB collection and export an inferred schema with generation constraints (array length distributions, field types, optionality), so that I can review, version-control, and potentially customize the schema before generating synthetic data.

**Why this priority**: Schema visibility and control enables advanced users to understand what will be generated, customize constraints, and maintain schema artifacts in version control. This supports more sophisticated workflows but isn't required for basic generation.

**Independent Test**: Can be fully tested by providing a collection URI, running the discovery phase, and verifying that the generated JSON schema includes field paths, type information, array length statistics (min/max/percentiles), and required field markers. Delivers value independently as schema documentation.

**Acceptance Scenarios**:

1. **Given** a MongoDB collection with diverse document structures, **When** the discovery phase samples 5,000 documents, **Then** the system produces three JSON artifacts: inferred.schema.json (raw schema), generation.schema.json (with x-gen vendor keywords), and constraints.json (array stats and size buckets)
2. **Given** a field present in 70% of sample documents, **When** the schema is inferred, **Then** that field is marked as optional (not in required array) and the presence rate is documented
3. **Given** nested object paths and array paths in samples, **When** the schema is generated, **Then** all paths are captured with full JSONPath-style notation (e.g., "user.addresses[].city")

---

### User Story 4 - Direct MongoDB Insertion (Priority: P2)

As a load testing engineer, I need to generate synthetic documents and insert them directly into a target MongoDB collection using configurable batch operations, so that I can populate test databases efficiently without manual file import steps.

**Why this priority**: Direct insertion eliminates manual steps and enables high-throughput database population. However, file-based generation (NDJSON output) already provides core value, making this an efficiency enhancement rather than a critical capability.

**Independent Test**: Can be fully tested by configuring a target MongoDB URI and collection, running the generator in insert mode with a batch size of 1000 documents, and verifying that documents appear in the target collection with correct batch write behavior. Delivers value as an automation improvement.

**Acceptance Scenarios**:

1. **Given** a target MongoDB collection and configuration for unordered bulk inserts with batch size 500, **When** the generator produces 10,000 synthetic documents, **Then** documents are inserted in batches of 500 using unordered bulk write operations
2. **Given** insert mode with write concern "majority", **When** the generator inserts documents, **Then** all write operations use the specified write concern and report success/failure appropriately
3. **Given** a target collection naming strategy of adding "_synthetic" suffix, **When** the generator runs against collection "users", **Then** synthetic documents are inserted into "users_synthetic"

---

### User Story 5 - Custom Field Value Generators (Priority: P3)

As a specialized testing engineer, I need to override the default value generator for specific field paths or types (e.g., always generate valid email addresses for "user.email" fields, or specific ObjectId patterns for "_id"), so that I can meet domain-specific constraints or integration requirements.

**Why this priority**: Custom generators enable advanced use cases where domain logic matters (e.g., valid email formats, specific ID patterns for downstream systems). Most users can achieve testing goals with default random generation, making this a power-user feature.

**Independent Test**: Can be fully tested by registering a custom generator function for a specific field path, running generation, and verifying that all generated documents use the custom logic for that field. Delivers value for specialized testing scenarios.

**Acceptance Scenarios**:

1. **Given** a custom generator registered for path "customer.email" that produces valid email addresses, **When** synthetic documents are generated, **Then** all customer.email fields contain properly formatted email addresses matching the custom pattern
2. **Given** a custom ObjectId generator that uses specific timestamp prefixes, **When** synthetic documents are generated with this override, **Then** all _id fields are ObjectIds with the specified timestamp pattern
3. **Given** custom generators for both a type (Date) and a specific path (user.birthdate), **When** generation runs, **Then** the path-specific override takes precedence over the type-level override

---

### User Story 6 - Validation and Quality Reports (Priority: P3)

As a quality assurance engineer, I need to validate generated documents against the generation schema and receive a quality report comparing array length distributions and document size distributions between samples and generated data, so that I can verify that synthetic data meets fidelity requirements.

**Why this priority**: Validation provides confidence and quality metrics, but the generation itself is the primary deliverable. Teams can manually spot-check for basic use cases, making comprehensive validation a quality-of-life enhancement.

**Independent Test**: Can be fully tested by generating a batch of synthetic documents and running the validation command, which produces a report showing schema conformance rate, array length histogram comparisons, and document size distribution analysis. Delivers independent value as a quality gate.

**Acceptance Scenarios**:

1. **Given** 10,000 generated documents and the generation schema, **When** the validation command runs, **Then** it produces a report showing 100% schema conformance (all documents valid against JSON schema) and histograms comparing sample vs generated array lengths for key paths
2. **Given** generated documents with array lengths that deviate significantly from sample distributions, **When** validation runs, **Then** the report flags these deviations with specific metrics (e.g., "path 'orders.items' p90 length in samples: 15, in generated: 45")
3. **Given** a uniqueness requirement for _id fields within a generation run, **When** validation checks are performed, **Then** the report confirms 100% uniqueness or lists duplicate _id values

---

### Edge Cases

- What happens when a MongoDB collection has highly heterogeneous documents (different top-level structures)? System should handle union types and capture multiple candidate types per path, documenting optionality for fields that don't appear in all samples.
- How does the system handle extremely large arrays (e.g., 10,000 elements in a single array)? Percentile clamping (default p01-p99) should prevent outlier inflation, but users can configure minmax policy to preserve full range if needed.
- What happens when sample documents contain binary data (BinData) or special MongoDB types not representable in JSON Schema? Normalizer converts these to string representations (base64 for binary, string with custom format for special types) with configurable handling.
- How does the system handle MongoDB collections with zero documents or insufficient samples? System should error gracefully, requiring minimum sample size (e.g., 100 documents) to infer meaningful statistics.
- What happens when two required key fields (e.g., accountId, userId) must maintain referential integrity across documents? V1 explicitly does not support cross-field constraints; each key is generated independently. Users can implement custom generators for this use case.
- How does the system handle sample collections where _id type varies (some ObjectId, some string UUID)? System infers union type for _id and generates according to inferred type distribution, or allows user to override with idPolicy configuration.

## Requirements *(mandatory)*

### Functional Requirements

#### Discovery Phase
- **FR-001**: System MUST sample N documents from a specified MongoDB collection using configurable sampling strategies (random sample, first-N, time-windowed)
- **FR-002**: System MUST normalize MongoDB-extended types (ObjectId, Date, Decimal128, BinData) into JSON Schema-compatible representations with custom format annotations
- **FR-003**: System MUST infer a probabilistic schema capturing field paths, candidate types per path (union types allowed), optionality (presence rate), array element types, and array length distribution statistics
- **FR-004**: System MUST produce three artifacts from discovery: inferred.schema.json (raw inferred schema), generation.schema.json (JSON Schema with x-gen vendor keywords), and constraints.json (array stats, size buckets, key configuration)
- **FR-005**: System MUST calculate array length statistics for each array path including minLen, maxLen, p50Len, p90Len, p99Len (or configurable percentiles)

#### Schema and Constraints
- **FR-006**: System MUST generate a JSON Schema conformant to draft-07 with properties for inferred fields, required array for minimal required keys (_id plus user-configured), and configurable additionalProperties (default true)
- **FR-007**: System MUST support vendor extension keywords (x-gen) for generation hints including x-gen.key (uniqueness preference), x-gen.mongoType (original MongoDB type), x-gen.arrayLen (length constraints and strategy), x-gen.sizeWeight (size proxy weighting)
- **FR-008**: System MUST set minItems and maxItems for array schemas based on profiled statistics, defaulting to percentile-clamped ranges (p01-p99) to avoid outlier inflation

#### Generation Phase
- **FR-009**: System MUST generate synthetic documents streaming (without holding all documents in memory) to support high-volume generation
- **FR-010**: System MUST accept a seed value to produce deterministic, repeatable output across runs
- **FR-011**: System MUST enforce array length constraints by sampling lengths from configured ranges (minmax or percentile-based) during generation
- **FR-012**: System MUST ensure _id field is always present and valid (ObjectId-like values for ObjectId type, or matching type inferred from samples)
- **FR-013**: System MUST support optional uniqueness enforcement for designated key fields (configurable scope: batch or full run) with memory cost awareness
- **FR-014**: System MUST register custom format generators for MongoDB types (objectid, date-time, uuid) and support user-provided custom generators for specific paths, types, or formats

#### Output and Insertion
- **FR-015**: System MUST support output formats of NDJSON (default/preferred) and JSON array (optional)
- **FR-016**: System MUST support output destinations of file path, stdout stream, or direct MongoDB insertion
- **FR-017**: System MUST support direct MongoDB insertion with configurable batch size, write concern, and ordered/unordered bulk operations
- **FR-018**: System MUST support target collection naming strategies (e.g., suffix "_synthetic") when inserting into MongoDB

#### Validation and Quality
- **FR-019**: System MUST validate generated documents against the generation schema using a JSON Schema validator
- **FR-020**: System MUST produce size equivalence comparison reports including array length histograms (sample vs generated) for tracked array paths and document size proxy distribution by buckets
- **FR-021**: System MUST verify _id uniqueness within a run and optional additional key uniqueness if configured

#### Configuration
- **FR-022**: System MUST accept configuration for connection parameters (sourceUri, sourceDb, sourceCollection, optional targetUri/targetDb/targetCollection)
- **FR-023**: System MUST accept configuration for sampling (sampleSize, samplingStrategy)
- **FR-024**: System MUST accept configuration for constraints (arrayLenPolicy: minmax or percentileClamp; percentiles array; clampRange)
- **FR-025**: System MUST accept configuration for keys (idPolicy: objectid, uuid, string, number, or inferred; keyFields list; enforceUniqueKeys boolean and scope)
- **FR-026**: System MUST accept configuration for generation (docCount, seed)
- **FR-027**: System MUST accept configuration for output (format: ndjson or json; path; optional splitFilesBy size or count)

#### Security and Quality Gates
- **FR-028**: Repository MUST include committed lockfile (package-lock.json or equivalent) and CI pipeline with npm audit or equivalent vulnerability scanning
- **FR-029**: System MUST emit a machine-readable run manifest including tool version, seed used, document counts, timestamp, and artifact hashes

#### CLI Interface
- **FR-030**: System MUST provide CLI commands for: infer (discovery phase producing schema and constraints), generate (generation phase producing NDJSON or inserting documents), validate (validation of generated output against schema and size constraints)

### Key Entities

- **Sample Document**: A document retrieved from the source MongoDB collection during the discovery phase. Contains field values, nested structures, arrays, and MongoDB-specific types that inform schema inference.
- **Inferred Schema**: The raw probabilistic schema extracted from sample documents, capturing field paths, type distributions, optionality rates, and array element types without JSON Schema formalization.
- **Generation Schema (GS)**: A JSON Schema draft-07 document with vendor extensions (x-gen keywords) that defines the structure and constraints for synthetic document generation. Includes field types, required fields, array length bounds, and custom format hints.
- **Constraints Profile**: A collection of statistical summaries extracted from samples including array length distributions (min/max/percentiles), document size buckets, and key field configurations. Guides generation to match sample characteristics.
- **Synthetic Document**: A generated document conforming to the Generation Schema and Constraints Profile. Contains fabricated values that preserve structural characteristics (nesting depth, array lengths, field types) of sample documents without semantic fidelity.
- **Run Manifest**: A machine-readable artifact documenting a generation run, including tool version, seed value, source and target configuration, document counts, timestamps, and artifact checksums for auditability and reproducibility.
- **Custom Generator**: A user-provided function or configuration that overrides default value generation for specific field paths, types, or formats. Enables domain-specific constraints (e.g., valid email patterns, specific ObjectId prefixes).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Generated documents preserve array length distributions such that for any tracked array path, the p50/p90/p99 lengths of generated documents are within 10% of sample document statistics
- **SC-002**: Generated documents preserve document size characteristics such that the distribution of document sizes (measured by total leaf field count or byte size) matches sample distribution within 20% per size bucket
- **SC-003**: System generates at least 10,000 documents per second on standard hardware (4-core CPU, 16GB RAM) when outputting to NDJSON file format
- **SC-004**: Generated documents are 100% schema-conformant when validated against the Generation Schema using a JSON Schema validator
- **SC-005**: Repeatability is guaranteed such that running the generator twice with the same seed, configuration, and sample set produces byte-identical NDJSON output
- **SC-006**: Users can complete the full workflow (discovery, generation, validation) for a collection with 10,000 samples generating 100,000 synthetic documents in under 5 minutes
- **SC-007**: Memory usage remains under 2GB even when generating 1 million documents, demonstrating effective streaming generation
- **SC-008**: All MongoDB-extended types present in samples (ObjectId, Date, Decimal128, BinData) are correctly normalized and re-generated in synthetic documents with type fidelity
- **SC-009**: Key field uniqueness (when enabled) is enforced with 100% success rate across a batch or full run, with no duplicate values detected in validation reports
- **SC-010**: Users can override default generation for any field path or type, and 100% of generated documents reflect the custom generator logic for those fields

## Assumptions *(mandatory)*

- MongoDB collections are accessible with read permissions; authentication credentials are provided via connection URI
- Sample documents are representative of the full collection's structural diversity; sampling 10,000 documents (configurable) provides sufficient statistical coverage for schema inference
- Generated documents do not require semantic fidelity (realistic names, addresses, business logic); random values preserving type and structure are acceptable
- Users accept that schemaless MongoDB collections may have heterogeneous structures; the tool provides best-effort inference and union types for fields with multiple observed types
- Performance targets assume SSDs for file I/O and local MongoDB instances for sampling; network-bound or disk-bound scenarios may reduce throughput
- Security and compliance requirements are out of scope; generated data is synthetic but not guaranteed to be anonymized or compliant with regulations (GDPR, HIPAA)
- Cross-document referential integrity (foreign keys) is not supported in V1; each document is generated independently
- Users have Node.js runtime environment and can install npm dependencies
- CI/CD infrastructure supports npm audit scanning and lockfile verification
- JSON Schema validator (e.g., AJV) is used for conformance checking; validation is performed post-generation, not inline during generation

## Dependencies *(mandatory)*

### External Dependencies
- **MongoDB Server**: Requires MongoDB 4.0 or later for source and optional target collections
- **Node.js Runtime**: Requires Node.js 18.x or later for modern JavaScript features and ecosystem compatibility
- **npm Packages**:
  - `mongodb-schema` for probabilistic schema inference
  - `json-schema-faker` for JSON Schema-based data generation
  - `@faker-js/faker` as the faker provider for custom formats (explicit avoidance of legacy faker package due to supply-chain incident)
  - JSON Schema validator (e.g., `ajv`) for post-generation validation
- **MongoDB Driver**: Official MongoDB Node.js driver for reading samples and inserting synthetic documents

### Internal Dependencies
- None (this is a new standalone tool)

### Assumptions about Dependencies
- `mongodb-schema` output is "schema-like" but not strict JSON Schema; transformation layer required to produce conformant draft-07 schemas
- `json-schema-faker` has known dependency chain audit noise (historical issues); requires CI verification but is accepted as the generation engine unless audit failures block deployment
- Dependency lockfile (package-lock.json) is committed to ensure reproducible builds
- Renovate or Dependabot is configured to monitor dependency updates and security advisories

## Out of Scope *(mandatory)*

### Explicitly Excluded
- **Statistical fidelity of field value distributions**: Generated values are random and do not preserve distributions (e.g., age distribution, geographic distribution) from sample data
- **Semantic fidelity**: Generated names, addresses, emails, and other text fields are synthetic and do not resemble real-world data meaningfully
- **Privacy/anonymization guarantees**: This tool generates synthetic data from inferred schemas, not transforms/redacts production data; it is not a data anonymization tool
- **Perfect schema correctness for schemaless collections**: Best-effort inference handles heterogeneous structures, but edge cases with rare document shapes may not be fully captured
- **Cross-document referential integrity**: Foreign key relationships or inter-document constraints are not modeled; each document is generated independently
- **Multi-collection coordination**: V1 does not support generating related documents across multiple collections with referential integrity
- **Advanced CDC event generation**: Tool generates documents for insertion but does not generate update/delete events or CDC-specific metadata (change streams, operation types)
- **Real-time streaming generation**: Generation is batch-oriented; real-time event streaming is not supported
- **GUI or web interface**: CLI-only tool; no graphical interface for configuration or visualization
- **Production data transformation**: Tool is for synthetic generation from samples, not for transforming or redacting actual production data

### Deferred to Future Versions
- **Cross-collection references**: Generating documents with foreign key relationships across collections (e.g., users → orders) is deferred to future versions
- **Update/delete event generation**: Simulating CDC update and delete operations is deferred; V1 focuses on insert events
- **Advanced document size control**: V1 uses heuristic size proxies (leaf field count, array length sum); future versions may support precise byte size targets
- **Machine learning-based distribution matching**: Using ML to preserve field value distributions is deferred; V1 uses random generation within type constraints
- **GUI/web interface**: Future versions may include a web-based configuration and visualization interface
- **Plugin architecture for custom generators**: V1 supports custom generator functions via API; a formal plugin system with discovery and packaging is deferred
