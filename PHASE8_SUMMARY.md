# Phase 8: Validation and Quality Reports - Implementation Summary

**Date**: 2025-12-26
**Branch**: 001-mongodb-doc-gen
**Tasks Completed**: T076-T087 (12 tasks)

## Overview

Implemented comprehensive validation and quality reporting system for mongoforge, enabling users to validate synthetic documents against JSON schemas and compare quality metrics (array lengths, document sizes, uniqueness) with sample data.

## Implementation

### Core Modules

#### 1. Schema Validator (`src/lib/validator/schema-validator.ts`)
- **T076**: Ajv-based JSON Schema draft-07 validator
  - Strict mode disabled to allow vendor extensions (x-gen)
  - Comprehensive error collection with path and message details
  - Single document and batch validation support

- **T077**: Schema conformance checker
  - Validates documents against GenerationSchema
  - Collects all validation errors per document
  - Calculates conformance rate (valid/total)
  - Returns detailed violation reports with document indices

- **T078**: _id field uniqueness checker
  - Validates 100% uniqueness requirement for _id field
  - Normalizes values to strings for comparison
  - Returns count of total, unique, and duplicate keys

- **T079**: Additional key field uniqueness checker
  - Supports dot-notation path for nested fields (e.g., "user.email")
  - Checks multiple fields simultaneously
  - Returns Map of field → uniqueness check results

#### 2. Quality Reporter (`src/lib/validator/quality-reporter.ts`)
- **T080**: Array length histogram comparison
  - Compares p50/p90/p99 percentiles between sample and generated
  - Calculates percentage deviation for each percentile
  - Applies configurable tolerance threshold (default 10%)
  - Returns pass/fail for each array field

- **T081**: Document size distribution comparison
  - Uses same size proxy type as sample (leafFieldCount, arrayLengthSum, or byteSize)
  - Compares probability distributions across size buckets
  - Maintains bucket configuration from sample for consistency
  - Returns bucket-by-bucket comparison with deviations

- **T082**: Deviation calculation with tolerances
  - 10% tolerance for array length deviations
  - 20% tolerance for document size deviations
  - Percentage-based deviation calculation: `|actual - expected| / expected * 100`
  - Tolerances configurable per validation run

#### 3. Validator Index (`src/lib/validator/index.ts`)
- **T083**: Module index and main validation function
  - Exports all validator components
  - Provides `validateDocuments()` convenience function
  - Orchestrates schema, array, size, and uniqueness validation
  - Returns comprehensive ValidationReport

### CLI Command

#### 4. Validate Command (`src/cli/commands/validate.ts`)
- **T084**: CLI command implementation
  - Follows CLI contract from specs/001-mongodb-doc-gen/contracts/cli-commands.md
  - Supports all required and optional flags
  - Returns JSON response with status, phase, and report
  - Proper exit codes (0=success, 1=validation failed, 2=config error, 4=file I/O error)

- **T085**: NDJSON input reader
  - Reads from file or stdin
  - Uses readline interface for efficient line-by-line parsing
  - Handles empty lines gracefully
  - Provides detailed error messages for malformed JSON

- **T086**: Validation report serializer
  - Converts Map objects to plain objects for JSON serialization
  - Adds `overallPassed` flag for quick pass/fail determination
  - Wraps report in CLI response format with status and phase
  - Supports both stdout and file output

### Tests

#### 5. Integration Test (`tests/integration/validation-workflow.test.ts`)
- **T087**: Comprehensive integration test suite
  - 16 test cases covering all validation components
  - Tests schema validation (T076-T077)
  - Tests uniqueness checking (T078-T079)
  - Tests array comparison (T080)
  - Tests size comparison (T081)
  - Tests tolerance calculations (T082)
  - Full workflow tests with Phase 3 generator integration
  - API demonstration test showing developer usage patterns

#### 6. Unit Tests
- `tests/unit/validator/schema-validator.test.ts`: 13 tests for SchemaValidator
- `tests/unit/validator/quality-reporter.test.ts`: 6 tests for quality comparison

## Files Created

```
src/lib/validator/
├── schema-validator.ts       # T076-T079: Schema validation and uniqueness
├── quality-reporter.ts        # T080-T082: Array/size comparison and deviation
└── index.ts                   # T083: Module exports and main function

src/cli/commands/
└── validate.ts                # T084-T086: CLI command with NDJSON I/O

tests/integration/
└── validation-workflow.test.ts # T087: Integration tests

tests/unit/validator/
├── schema-validator.test.ts   # Unit tests for schema validation
└── quality-reporter.test.ts   # Unit tests for quality comparison

docs/
└── validation-api-examples.md # Developer documentation and examples
```

## Test Results

### Integration Tests
✅ **16/16 tests passing**
- T076: Ajv-based JSON Schema validator
- T077: Schema conformance checker
- T078: Uniqueness checker for _id field
- T079: Uniqueness checker for additional key fields
- T080: Array length histogram comparison
- T081: Document size distribution comparison
- T082: Deviation calculation with tolerances
- Full validation workflow (3 tests)

### Unit Tests
✅ **19/19 tests passing**
- SchemaValidator: 13 tests
- Quality Reporter: 6 tests

## API Examples

### Basic Schema Validation
```typescript
import { SchemaValidator } from 'mongoforge/lib/validator';

const validator = new SchemaValidator();
validator.compile(schema);
const isValid = validator.validate(document);
```

### Uniqueness Checking
```typescript
import { checkIdUniqueness, checkKeyFieldUniqueness } from 'mongoforge/lib/validator';

const idCheck = checkIdUniqueness(documents);
const keyChecks = checkKeyFieldUniqueness(documents, ['email', 'accountId']);
```

### Quality Comparison
```typescript
import { compareArrayLengths, compareDocumentSizes } from 'mongoforge/lib/validator';

const arrayComparison = compareArrayLengths(sampleStats, generatedDocs, 0.1);
const sizeComparison = compareDocumentSizes(sampleBuckets, generatedDocs, 0.2);
```

### Complete Workflow
```typescript
import { validateDocuments } from 'mongoforge/lib/validator';

const report = validateDocuments(documents, schema, constraints, {
  arrayLengthTolerance: 0.1,
  sizeBucketTolerance: 0.2,
});

console.log(`Schema conformance: ${report.schemaConformance.conformanceRate * 100}%`);
console.log(`_id uniqueness: ${report.keyUniqueness._id.passed ? 'PASS' : 'FAIL'}`);
```

### CLI Usage
```bash
# Validate NDJSON file
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson \
  --output-path ./output/validation-report.json

# Validate from stdin with custom tolerances
cat synthetic-docs.ndjson | mongoforge validate \
  --generation-schema schema.json \
  --constraints constraints.json \
  --input-path stdin \
  --tolerance-array-len 5 \
  --tolerance-doc-size 15
```

## Key Features

1. **Ajv-based Validation**: Industry-standard JSON Schema validation with draft-07 support
2. **Comprehensive Error Reporting**: Detailed error messages with field paths and validation keywords
3. **Uniqueness Enforcement**: Configurable uniqueness checking for _id and additional key fields
4. **Statistical Comparison**: Array length and document size distribution matching
5. **Configurable Tolerances**: Adjustable thresholds for quality metrics (10% array, 20% size default)
6. **CLI Integration**: Full command-line interface with JSON I/O
7. **Streaming Support**: NDJSON input from files or stdin for large datasets
8. **Type Safety**: Comprehensive TypeScript types throughout

## Design Decisions

### Tolerance Values
- **Array Lengths**: 10% default tolerance (spec requirement)
- **Document Sizes**: 20% default tolerance (spec requirement)
- Both configurable via CLI flags or API options

### Deviation Calculation
- Uses percentage-based calculation: `|actual - expected| / expected * 100`
- Handles edge cases (expected=0, both=0)
- Returns maximum deviation (100%) when expected is 0 but actual is not

### Error Path Handling
- Ajv uses different path formats for different error types
- `required` errors: Extract missing property from params
- Other errors: Use instancePath or schemaPath
- Ensures error paths always include field names for debugging

### Size Bucket Matching
- Reuses sample bucket configuration for generated document classification
- Ensures apples-to-apples comparison across same size ranges
- Preserves sizeProxy type from sample (leafFieldCount, arrayLengthSum, byteSize)

## Integration Points

### With Phase 3 (Generation)
- Validates documents generated by `generateDocuments()`
- Uses same GenerationSchema for both generation and validation
- Ensures schema conformance of synthetic documents

### With Phase 2 (Profiling)
- Consumes ConstraintsProfile from `profileDocuments()`
- Uses ArrayLengthStats for array comparison
- Uses DocumentSizeBucket for size distribution comparison

### With CLI
- Validate command reads schema/constraints from files
- Outputs JSON reports compatible with CI/CD pipelines
- Supports piping for integration with other tools

## Performance Characteristics

- **Schema Compilation**: One-time cost per validation run
- **Document Validation**: Linear time O(n) for n documents
- **Uniqueness Checking**: O(n) with Set-based deduplication
- **Array Stats**: O(n*m) where m is average array count per document
- **Size Bucketing**: O(n*b) where b is number of buckets

## Next Steps

Phase 8 is complete. All 12 tasks (T076-T087) implemented and tested.

## Documentation

- [API Examples](docs/validation-api-examples.md) - Comprehensive usage guide
- [Data Model](specs/001-mongodb-doc-gen/data-model.md) - ValidationReport structure
- [CLI Contracts](specs/001-mongodb-doc-gen/contracts/cli-commands.md) - Validate command spec
- [Integration Tests](tests/integration/validation-workflow.test.ts) - Working examples
