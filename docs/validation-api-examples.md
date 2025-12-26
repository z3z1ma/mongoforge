# Validation API Examples

This guide demonstrates how to use the mongoforge validation APIs to validate synthetic documents and generate quality reports.

## Table of Contents

- [Schema Validation](#schema-validation)
- [Uniqueness Checking](#uniqueness-checking)
- [Array Length Comparison](#array-length-comparison)
- [Document Size Distribution](#document-size-distribution)
- [Complete Validation Workflow](#complete-validation-workflow)
- [CLI Usage](#cli-usage)

## Schema Validation

Validate documents against a JSON Schema draft-07 schema using Ajv.

```typescript
import { SchemaValidator } from 'mongoforge/lib/validator';
import { GenerationSchema } from 'mongoforge/types/data-model';

// Define your generation schema
const schema: GenerationSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  title: 'UserDocument',
  properties: {
    _id: { type: 'string', format: 'objectid' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    age: { type: 'number', minimum: 0, maximum: 150 },
  },
  required: ['_id', 'name', 'email'],
  additionalProperties: true,
};

// Create validator and compile schema
const validator = new SchemaValidator();
validator.compile(schema);

// Validate a single document
const doc = {
  _id: '507f1f77bcf86cd799439011',
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
};

const isValid = validator.validate(doc);
console.log('Document valid:', isValid);

if (!isValid) {
  const errors = validator.getErrors();
  console.error('Validation errors:', errors);
}

// Validate multiple documents at once
const documents = [
  { _id: '1', name: 'Alice', email: 'alice@example.com' },
  { _id: '2', name: 'Bob', email: 'bob@example.com' },
  { _id: '3', name: 'Charlie' }, // Invalid: missing email
];

const result = validator.validateAll(documents);
console.log('Validation summary:');
console.log(`  Total: ${result.totalDocuments}`);
console.log(`  Valid: ${result.validDocuments}`);
console.log(`  Invalid: ${result.invalidDocuments}`);
console.log(`  Conformance rate: ${(result.conformanceRate * 100).toFixed(2)}%`);
console.log(`  Violations: ${result.violations.length}`);

// Inspect violations
result.violations.forEach((violation) => {
  console.log(`Document ${violation.documentIndex}:`);
  violation.errors.forEach((error) => {
    console.log(`  - ${error.path}: ${error.message}`);
  });
});
```

## Uniqueness Checking

Check for duplicate values in _id and other key fields.

```typescript
import { checkIdUniqueness, checkKeyFieldUniqueness } from 'mongoforge/lib/validator';

const documents = [
  { _id: '507f1f77bcf86cd799439011', email: 'user1@example.com' },
  { _id: '507f1f77bcf86cd799439012', email: 'user2@example.com' },
  { _id: '507f1f77bcf86cd799439013', email: 'user3@example.com' },
];

// Check _id uniqueness
const idCheck = checkIdUniqueness(documents);
console.log('_id Uniqueness:');
console.log(`  Total: ${idCheck.totalKeys}`);
console.log(`  Unique: ${idCheck.uniqueKeys}`);
console.log(`  Duplicates: ${idCheck.duplicates}`);
console.log(`  Passed: ${idCheck.passed}`);

// Check additional key fields
const keyChecks = checkKeyFieldUniqueness(documents, ['email']);
const emailCheck = keyChecks.get('email');
console.log('Email Uniqueness:');
console.log(`  Total: ${emailCheck.totalKeys}`);
console.log(`  Unique: ${emailCheck.uniqueKeys}`);
console.log(`  Duplicates: ${emailCheck.duplicates}`);
console.log(`  Passed: ${emailCheck.passed}`);

// Check nested field uniqueness
const nestedDocs = [
  { user: { accountId: 'ACC001' } },
  { user: { accountId: 'ACC002' } },
  { user: { accountId: 'ACC003' } },
];

const nestedChecks = checkKeyFieldUniqueness(nestedDocs, ['user.accountId']);
const accountCheck = nestedChecks.get('user.accountId');
console.log('Nested field passed:', accountCheck.passed);
```

## Array Length Comparison

Compare array length distributions between sample and generated documents.

```typescript
import { compareArrayLengths } from 'mongoforge/lib/validator';
import { ArrayLengthStats } from 'mongoforge/types/data-model';

// Sample statistics (from profiler)
const sampleStats = new Map<string, ArrayLengthStats>([
  [
    'tags',
    {
      fieldPath: 'tags',
      observedLengths: [1, 2, 2, 3, 3, 3, 4, 5],
      minLen: 1,
      maxLen: 5,
      p50Len: 3,
      p90Len: 4,
      p99Len: 5,
      mean: 2.875,
      stdDev: 1.125,
    },
  ],
]);

// Generated documents
const generatedDocs = [
  { tags: ['a', 'b', 'c'] }, // 3
  { tags: ['a', 'b', 'c'] }, // 3
  { tags: ['a', 'b', 'c', 'd'] }, // 4
  { tags: ['a', 'b'] }, // 2
  { tags: ['a', 'b', 'c', 'd', 'e'] }, // 5
];

// Compare with 10% tolerance
const comparison = compareArrayLengths(sampleStats, generatedDocs, 0.1);

// Inspect results
const tagsComparison = comparison.tags;
console.log('Tags Array Comparison:');
console.log('  Sample:');
console.log(`    p50: ${tagsComparison.sample.p50Len}`);
console.log(`    p90: ${tagsComparison.sample.p90Len}`);
console.log(`    p99: ${tagsComparison.sample.p99Len}`);
console.log('  Generated:');
console.log(`    p50: ${tagsComparison.generated.p50Len}`);
console.log(`    p90: ${tagsComparison.generated.p90Len}`);
console.log(`    p99: ${tagsComparison.generated.p99Len}`);
console.log('  Deviation:');
console.log(`    p50: ${tagsComparison.deviation.p50.toFixed(2)}%`);
console.log(`    p90: ${tagsComparison.deviation.p90.toFixed(2)}%`);
console.log(`    p99: ${tagsComparison.deviation.p99.toFixed(2)}%`);
console.log(`  Passed: ${tagsComparison.passed}`);
```

## Document Size Distribution

Compare document size distributions using size buckets.

```typescript
import { compareDocumentSizes } from 'mongoforge/lib/validator';
import { DocumentSizeBucket } from 'mongoforge/types/data-model';

// Sample buckets (from profiler)
const sampleBuckets: DocumentSizeBucket[] = [
  {
    bucketId: 'small',
    sizeRange: { min: 0, max: 3 },
    sizeProxy: 'leafFieldCount',
    count: 20,
    probability: 0.2,
  },
  {
    bucketId: 'medium',
    sizeRange: { min: 3, max: 6 },
    sizeProxy: 'leafFieldCount',
    count: 60,
    probability: 0.6,
  },
  {
    bucketId: 'large',
    sizeRange: { min: 6, max: 10 },
    sizeProxy: 'leafFieldCount',
    count: 20,
    probability: 0.2,
  },
];

// Generated documents
const generatedDocs = [
  { a: 1, b: 2 }, // 2 fields - small
  { a: 1, b: 2, c: 3, d: 4 }, // 4 fields - medium
  { a: 1, b: 2, c: 3, d: 4, e: 5 }, // 5 fields - medium
  { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 }, // 7 fields - large
];

// Compare with 20% tolerance
const comparison = compareDocumentSizes(sampleBuckets, generatedDocs, 0.2);

// Inspect bucket-by-bucket results
comparison.buckets.forEach((bucket) => {
  console.log(`Bucket: ${bucket.bucketId}`);
  console.log(`  Sample: ${bucket.sample.count} docs (${(bucket.sample.probability * 100).toFixed(1)}%)`);
  console.log(`  Generated: ${bucket.generated.count} docs (${(bucket.generated.probability * 100).toFixed(1)}%)`);
  console.log(`  Deviation: ${bucket.deviation.toFixed(2)}%`);
  console.log(`  Passed: ${bucket.passed}`);
});

// Overall pass/fail
const allPassed = comparison.buckets.every((b) => b.passed);
console.log(`Overall distribution match: ${allPassed ? 'PASS' : 'FAIL'}`);
```

## Complete Validation Workflow

End-to-end validation using all validation components.

```typescript
import { validateDocuments } from 'mongoforge/lib/validator';
import { generateDocuments } from 'mongoforge/lib/generator';
import { profileDocuments } from 'mongoforge/lib/profiler';
import { GenerationSchema, ConstraintsProfile } from 'mongoforge/types/data-model';

async function completeValidationWorkflow() {
  // 1. Define generation schema
  const schema: GenerationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'TestDocument',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 5,
      },
    },
    required: ['_id', 'name', 'email'],
    additionalProperties: true,
  };

  // 2. Generate synthetic documents
  const generatedDocs = await generateDocuments(schema, 100, 'test-seed-123');

  // 3. Create constraints profile from generated docs (or load from sample)
  const normalizedDocs = generatedDocs.map((doc) => ({
    ...doc,
    __typeHints: {},
  }));
  const constraints: ConstraintsProfile = profileDocuments(normalizedDocs);

  // 4. Validate all documents
  const report = validateDocuments(generatedDocs, schema, constraints, {
    arrayLengthTolerance: 0.1, // 10% tolerance for array lengths
    sizeBucketTolerance: 0.2, // 20% tolerance for document sizes
  });

  // 5. Print validation report
  console.log('=== VALIDATION REPORT ===\n');

  // Schema conformance
  console.log('Schema Conformance:');
  console.log(`  Total documents: ${report.schemaConformance.totalDocuments}`);
  console.log(`  Valid: ${report.schemaConformance.validDocuments}`);
  console.log(`  Invalid: ${report.schemaConformance.invalidDocuments}`);
  console.log(`  Conformance rate: ${(report.schemaConformance.conformanceRate * 100).toFixed(2)}%`);
  console.log(`  Violations: ${report.schemaConformance.violations.length}\n`);

  // Array length comparison
  console.log('Array Length Comparison:');
  Object.entries(report.arrayLengthComparison).forEach(([field, comparison]) => {
    console.log(`  ${field}:`);
    console.log(`    p50 deviation: ${comparison.deviation.p50.toFixed(2)}%`);
    console.log(`    p90 deviation: ${comparison.deviation.p90.toFixed(2)}%`);
    console.log(`    p99 deviation: ${comparison.deviation.p99.toFixed(2)}%`);
    console.log(`    Passed: ${comparison.passed}`);
  });
  console.log();

  // Document size comparison
  console.log('Document Size Distribution:');
  report.documentSizeComparison.buckets.forEach((bucket) => {
    console.log(`  ${bucket.bucketId}:`);
    console.log(`    Sample: ${(bucket.sample.probability * 100).toFixed(1)}%`);
    console.log(`    Generated: ${(bucket.generated.probability * 100).toFixed(1)}%`);
    console.log(`    Deviation: ${bucket.deviation.toFixed(2)}%`);
    console.log(`    Passed: ${bucket.passed}`);
  });
  console.log();

  // Key uniqueness
  console.log('Key Uniqueness:');
  console.log(`  _id: ${report.keyUniqueness._id.passed ? 'PASS' : 'FAIL'}`);
  console.log(`    Duplicates: ${report.keyUniqueness._id.duplicates}`);

  // Overall result
  const schemaPass = report.schemaConformance.conformanceRate === 1.0;
  const arrayPass = Object.values(report.arrayLengthComparison).every((c) => c.passed);
  const sizePass = report.documentSizeComparison.buckets.every((b) => b.passed);
  const idPass = report.keyUniqueness._id.passed;
  const overallPassed = schemaPass && arrayPass && sizePass && idPass;

  console.log(`\nOVERALL RESULT: ${overallPassed ? 'PASS ✓' : 'FAIL ✗'}`);

  return report;
}

// Run the workflow
completeValidationWorkflow().catch(console.error);
```

## CLI Usage

### Validate NDJSON File

```bash
# Validate generated documents against schema and constraints
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson \
  --output-path ./output/validation-report.json
```

### Validate from stdin

```bash
# Pipe generated documents directly to validator
cat ./output/synthetic-users.ndjson | mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path stdin
```

### Adjust Tolerances

```bash
# Use stricter tolerances
mongoforge validate \
  --generation-schema ./schemas/generation.schema.json \
  --constraints ./schemas/constraints.json \
  --input-path ./output/synthetic-users.ndjson \
  --tolerance-array-len 5 \
  --tolerance-doc-size 10
```

### Sample Output

```json
{
  "status": "success",
  "phase": "validation",
  "report": {
    "schemaConformance": {
      "totalDocuments": 10000,
      "validDocuments": 10000,
      "invalidDocuments": 0,
      "conformanceRate": 1.0,
      "violations": []
    },
    "arrayLengthComparison": {
      "tags": {
        "sample": { "minLen": 0, "maxLen": 10, "p50Len": 3, "p90Len": 7, "p99Len": 10 },
        "generated": { "minLen": 1, "maxLen": 10, "p50Len": 3, "p90Len": 7, "p99Len": 10 },
        "deviation": { "p50": 0, "p90": 0, "p99": 0 },
        "passed": true
      }
    },
    "documentSizeComparison": {
      "buckets": [
        {
          "bucketId": "medium",
          "sample": { "count": 3200, "probability": 0.64 },
          "generated": { "count": 6300, "probability": 0.63 },
          "deviation": 1.56,
          "passed": true
        }
      ]
    },
    "keyUniqueness": {
      "_id": {
        "totalKeys": 10000,
        "uniqueKeys": 10000,
        "duplicates": 0,
        "passed": true
      },
      "additionalKeys": {}
    },
    "overallPassed": true
  }
}
```

## Exit Codes

- `0`: Validation passed
- `1`: Validation failed (schema violations, constraint violations)
- `2`: Invalid configuration
- `4`: File I/O error

## Best Practices

1. **Schema Validation First**: Always validate schema conformance before checking quality metrics
2. **Tolerance Tuning**: Start with default tolerances (10% array, 20% size) and adjust based on your use case
3. **Uniqueness Enforcement**: Enable uniqueness checking for _id and any business-critical key fields
4. **Sample Size**: Use larger sample sizes (10k+ documents) for more stable quality comparisons
5. **Continuous Validation**: Integrate validation into your CI/CD pipeline to catch regressions early

## Error Handling

```typescript
import { validateDocuments } from 'mongoforge/lib/validator';

try {
  const report = validateDocuments(documents, schema, constraints);

  if (report.schemaConformance.conformanceRate < 1.0) {
    console.error('Schema validation failed:');
    report.schemaConformance.violations.forEach((v) => {
      console.error(`  Document ${v.documentIndex}:`, v.errors);
    });
    process.exit(1);
  }

  if (!report.keyUniqueness._id.passed) {
    console.error(`Found ${report.keyUniqueness._id.duplicates} duplicate _id values`);
    process.exit(1);
  }

  const arrayFailures = Object.entries(report.arrayLengthComparison).filter(([_, c]) => !c.passed);
  if (arrayFailures.length > 0) {
    console.warn('Array length deviations detected:');
    arrayFailures.forEach(([field, comparison]) => {
      console.warn(`  ${field}: p50=${comparison.deviation.p50.toFixed(2)}%`);
    });
  }
} catch (error) {
  console.error('Validation error:', error.message);
  process.exit(1);
}
```

## See Also

- [Data Model Documentation](../specs/001-mongodb-doc-gen/data-model.md)
- [CLI Command Contracts](../specs/001-mongodb-doc-gen/contracts/cli-commands.md)
- [Integration Tests](../tests/integration/validation-workflow.test.ts)
