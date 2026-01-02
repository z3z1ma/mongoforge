/**
 * T087: Integration test for validation workflow
 * Tests the complete validation pipeline: schema validation, uniqueness checks, and quality comparison
 */

import { describe, it, expect } from 'vitest';
import { SchemaValidator, checkIdUniqueness, checkKeyFieldUniqueness } from '../../src/lib/validator/schema-validator.js';
import { compareArrayLengths, compareDocumentSizes } from '../../src/lib/validator/quality-reporter.js';
import { validateDocuments } from '../../src/lib/validator/index.js';
import { generateDocuments } from '../../src/lib/generator/index.js';
import { profileDocuments } from '../../src/lib/profiler/index.js';
import { GenerationSchema, ConstraintsProfile, ArrayLengthStats, DocumentSizeBucket } from '../../src/types/data-model.js';

describe('Phase 8: Validation and Quality Reports - Integration', () => {
  // Sample generation schema for testing
  const testSchema: GenerationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'TestDocument',
    properties: {
      _id: {
        type: 'string',
        format: 'objectid',
        'x-gen': {
          key: true,
          mongoType: 'ObjectId',
        },
      },
      name: {
        type: 'string',
      },
      email: {
        type: 'string',
        format: 'email',
      },
      age: {
        type: 'number',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 5,
        'x-gen': {
          arrayLen: {
            min: 1,
            max: 5,
            p50: 3,
            p90: 4,
            p99: 5,
            strategy: 'percentile',
          },
        },
      },
      metadata: {
        type: 'object',
        properties: {
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          version: {
            type: 'number',
          },
        },
      },
    },
    required: ['_id', 'name', 'email'],
    additionalProperties: true,
  };

  describe('T076: Ajv-based JSON Schema validator', () => {
    it('should compile and validate valid documents', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      const validDoc = {
        _id: '507f1f77bcf86cd799439011',
        name: 'John Doe',
        email: 'john@example.com',
        tags: ['tag1', 'tag2'],
      };

      const isValid = validator.validate(validDoc);
      expect(isValid).toBe(true);
      expect(validator.getErrors()).toHaveLength(0);
    });

    it('should detect schema violations', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      const invalidDoc = {
        _id: '507f1f77bcf86cd799439011',
        name: 'John Doe',
        // Missing required 'email' field
        tags: ['tag1', 'tag2'],
      };

      const isValid = validator.validate(invalidDoc);
      expect(isValid).toBe(false);

      const errors = validator.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.path.includes('email'))).toBe(true);
    });

    it('should validate all documents and collect violations', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      const documents = [
        { _id: '507f1f77bcf86cd799439011', name: 'John', email: 'john@example.com' },
        { _id: '507f1f77bcf86cd799439012', name: 'Jane', email: 'jane@example.com' },
        { _id: '507f1f77bcf86cd799439013', name: 'Bob' }, // Missing email
        { _id: '507f1f77bcf86cd799439014', name: 'Alice', email: 'alice@example.com' },
      ];

      const result = validator.validateAll(documents);

      expect(result.totalDocuments).toBe(4);
      expect(result.validDocuments).toBe(3);
      expect(result.invalidDocuments).toBe(1);
      expect(result.conformanceRate).toBe(0.75);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.documentIndex).toBe(2);
    });
  });

  describe('T077: Schema conformance checker', () => {
    it('should validate type constraints', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      const doc = {
        _id: '507f1f77bcf86cd799439011',
        name: 'John',
        email: 'john@example.com',
        age: 'thirty', // Should be number
      };

      const isValid = validator.validate(doc);
      expect(isValid).toBe(false);

      const errors = validator.getErrors();
      expect(errors.some((e) => e.path.includes('age'))).toBe(true);
    });
  });

  describe('T078: Uniqueness checker for _id field', () => {
    it('should detect unique _id values', () => {
      const documents = [
        { _id: '507f1f77bcf86cd799439011', name: 'Doc1' },
        { _id: '507f1f77bcf86cd799439012', name: 'Doc2' },
        { _id: '507f1f77bcf86cd799439013', name: 'Doc3' },
      ];

      const result = checkIdUniqueness(documents);

      expect(result.totalKeys).toBe(3);
      expect(result.uniqueKeys).toBe(3);
      expect(result.duplicates).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('should detect duplicate _id values', () => {
      const documents = [
        { _id: '507f1f77bcf86cd799439011', name: 'Doc1' },
        { _id: '507f1f77bcf86cd799439012', name: 'Doc2' },
        { _id: '507f1f77bcf86cd799439011', name: 'Doc3' }, // Duplicate
        { _id: '507f1f77bcf86cd799439013', name: 'Doc4' },
      ];

      const result = checkIdUniqueness(documents);

      expect(result.totalKeys).toBe(4);
      expect(result.uniqueKeys).toBe(3);
      expect(result.duplicates).toBe(1);
      expect(result.passed).toBe(false);
    });
  });

  describe('T079: Uniqueness checker for additional key fields', () => {
    it('should check uniqueness of nested fields', () => {
      const documents = [
        { _id: '1', user: { email: 'user1@example.com' } },
        { _id: '2', user: { email: 'user2@example.com' } },
        { _id: '3', user: { email: 'user3@example.com' } },
      ];

      const result = checkKeyFieldUniqueness(documents, ['user.email']);

      expect(result.has('user.email')).toBe(true);
      const emailCheck = result.get('user.email');
      expect(emailCheck?.totalKeys).toBe(3);
      expect(emailCheck?.uniqueKeys).toBe(3);
      expect(emailCheck?.duplicates).toBe(0);
      expect(emailCheck?.passed).toBe(true);
    });

    it('should detect duplicates in additional key fields', () => {
      const documents = [
        { _id: '1', accountId: 'ACC001' },
        { _id: '2', accountId: 'ACC002' },
        { _id: '3', accountId: 'ACC001' }, // Duplicate
      ];

      const result = checkKeyFieldUniqueness(documents, ['accountId']);

      const accountCheck = result.get('accountId');
      expect(accountCheck?.totalKeys).toBe(3);
      expect(accountCheck?.uniqueKeys).toBe(2);
      expect(accountCheck?.duplicates).toBe(1);
      expect(accountCheck?.passed).toBe(false);
    });
  });

  describe('T080: Array length histogram comparison', () => {
    it('should compare array length distributions', () => {
      const sampleStats = new Map<string, ArrayLengthStats>([
        [
          'tags',
          {
            fieldPath: 'tags',
            distribution: { '1': 1, '2': 2, '3': 3, '4': 1, '5': 1 },
            stats: {
              min: 1,
              max: 5,
              median: 3,
              p95: 5,
              total: 8,
              unique: 5,
            },
            arraysAnalyzed: 8,
          },
        ],
      ]);

      const generatedDocs = [
        { tags: ['a', 'b', 'c'] }, // 3
        { tags: ['a', 'b', 'c'] }, // 3
        { tags: ['a', 'b', 'c', 'd'] }, // 4
        { tags: ['a', 'b'] }, // 2
        { tags: ['a', 'b', 'c', 'd', 'e'] }, // 5
      ];

      const comparison = compareArrayLengths(sampleStats, generatedDocs, 0.2);

      expect(comparison.tags).toBeDefined();
      expect(comparison.tags?.generated.p50Len).toBe(3);
      expect(comparison.tags?.deviation.p50).toBeLessThanOrEqual(0.2); // Within 20% in fractional form
    });

    it('should detect significant deviations', () => {
      const sampleStats = new Map<string, ArrayLengthStats>([
        [
          'tags',
          {
            fieldPath: 'tags',
            distribution: { '1': 1, '2': 1, '3': 1 },
            stats: {
              min: 1,
              max: 3,
              median: 2,
              p95: 3,
              total: 3,
              unique: 3,
            },
            arraysAnalyzed: 3,
          },
        ],
      ]);

      const generatedDocs = [
        { tags: Array(10).fill('x') }, // Way too long
        { tags: Array(10).fill('x') },
        { tags: Array(10).fill('x') },
      ];

      const comparison = compareArrayLengths(sampleStats, generatedDocs, 0.1);

      expect(comparison.tags?.passed).toBe(false);
      expect(comparison.tags?.deviation.p50).toBeGreaterThan(0.1); // 10% threshold in fractional form
    });
  });

  describe('T081: Document size distribution comparison', () => {
    it('should compare document size distributions', () => {
      const sampleBuckets: DocumentSizeBucket[] = [
        {
          bucketId: 'small',
          sizeRange: { min: 0, max: 3 },
          sizeProxy: 'leafFieldCount',
          count: 10,
          probability: 0.2,
        },
        {
          bucketId: 'medium',
          sizeRange: { min: 3, max: 6 },
          sizeProxy: 'leafFieldCount',
          count: 30,
          probability: 0.6,
        },
        {
          bucketId: 'large',
          sizeRange: { min: 6, max: 10 },
          sizeProxy: 'leafFieldCount',
          count: 10,
          probability: 0.2,
        },
      ];

      const generatedDocs = [
        { a: 1, b: 2, c: 3, d: 4 }, // 4 fields - medium
        { a: 1, b: 2, c: 3, d: 4, e: 5 }, // 5 fields - medium
        { a: 1, b: 2 }, // 2 fields - small
        { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 }, // 7 fields - large
      ];

      const comparison = compareDocumentSizes(sampleBuckets, generatedDocs, 0.3);

      expect(comparison.buckets).toHaveLength(3);
      expect(comparison.buckets.every((b) => b.bucketId)).toBe(true);
    });
  });

  describe('T082: Deviation calculation with tolerances', () => {
    it('should apply 10% tolerance for array lengths', () => {
      const sampleStats = new Map<string, ArrayLengthStats>([
        [
          'items',
          {
            fieldPath: 'items',
            distribution: { '5': 5 },
            stats: {
              min: 5,
              max: 5,
              median: 5,
              p90: 5,
              p95: 5,
              p99: 5,
              total: 5,
              unique: 1,
            },
            arraysAnalyzed: 5,
          },
        ],
      ]);

      // Generated docs with 5% deviation (within 10% tolerance)
      const generatedDocs = [
        { items: Array(5).fill('x') },
        { items: Array(5).fill('x') },
        { items: Array(5).fill('x') },
      ];

      const comparison = compareArrayLengths(sampleStats, generatedDocs, 0.1);
      expect(comparison.items?.passed).toBe(true);
    });

    it('should apply 20% tolerance for document sizes', () => {
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

      // Documents with similar size distribution (60% medium, 20% small, 20% large)
      const generatedDocs = Array(100)
        .fill(null)
        .map((_, i) => {
          if (i < 20) return { a: 1, b: 2 }; // 2 fields - small
          if (i < 80) return { a: 1, b: 2, c: 3, d: 4, e: 5 }; // 5 fields - medium
          return { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 }; // 8 fields - large
        });

      const comparison = compareDocumentSizes(sampleBuckets, generatedDocs, 0.2);

      // All buckets should have low deviation
      for (const bucket of comparison.buckets) {
        expect(bucket.deviation).toBeLessThanOrEqual(0.2); // 20% in fractional form
      }
    });
  });

  describe('Full validation workflow', () => {
    it('should validate documents generated in Phase 3', async () => {
      // Generate synthetic documents using Phase 3 generator
      const docs = await generateDocuments(testSchema, 100, 'validation-test-seed');

      expect(docs.length).toBe(100);

      // Create constraints profile from generated documents (simulate sample profiling)
      const normalizedDocs = docs.map((doc) => ({
        ...doc,
        __typeHints: {},
      }));

      const constraints = profileDocuments(normalizedDocs);

      // Validate the generated documents
      const report = validateDocuments(docs, testSchema, constraints, {
        arrayLengthTolerance: 0.1,
        sizeBucketTolerance: 0.2,
      });

      // Schema conformance should be 100%
      expect(report.schemaConformance.conformanceRate).toBe(1.0);
      expect(report.schemaConformance.violations).toHaveLength(0);

      // _id uniqueness should pass
      expect(report.keyUniqueness._id.passed).toBe(true);
      expect(report.keyUniqueness._id.duplicates).toBe(0);

      // Array length comparison should exist for 'tags' field
      expect(report.arrayLengthComparison.tags).toBeDefined();

      // Document size comparison should have buckets
      expect(report.documentSizeComparison.buckets.length).toBeGreaterThan(0);
    });

    it('should produce complete validation report', async () => {
      const docs = await generateDocuments(testSchema, 50, 'complete-report-seed');

      const normalizedDocs = docs.map((doc) => ({
        ...doc,
        __typeHints: {},
      }));

      const constraints = profileDocuments(normalizedDocs);

      const report = validateDocuments(docs, testSchema, constraints);

      // Verify report structure
      expect(report.schemaConformance).toBeDefined();
      expect(report.schemaConformance.totalDocuments).toBe(50);
      expect(report.schemaConformance.validDocuments).toBe(50);
      expect(report.schemaConformance.conformanceRate).toBe(1.0);

      expect(report.arrayLengthComparison).toBeDefined();
      expect(report.documentSizeComparison).toBeDefined();
      expect(report.documentSizeComparison.buckets).toBeDefined();

      expect(report.keyUniqueness).toBeDefined();
      expect(report.keyUniqueness._id).toBeDefined();
      expect(report.keyUniqueness.additionalKeys).toBeDefined();
    });

    it('should demonstrate API usage patterns', async () => {
      // Step 1: Generate documents
      const generatedDocs = await generateDocuments(testSchema, 100, 'api-demo-seed');

      // Step 2: Create sample documents (simulating real sample data)
      const sampleDocs = generatedDocs.slice(0, 20).map((doc) => ({
        ...doc,
        __typeHints: {},
      }));

      // Step 3: Profile sample documents to create constraints
      const constraints = profileDocuments(sampleDocs);

      // Step 4: Validate generated documents
      const report = validateDocuments(generatedDocs, testSchema, constraints, {
        arrayLengthTolerance: 0.15, // 15% tolerance
        sizeBucketTolerance: 0.25, // 25% tolerance
      });

      // Step 5: Check validation results
      const schemaPass = report.schemaConformance.conformanceRate === 1.0;
      const uniquenessPass = report.keyUniqueness._id.passed;

      expect(schemaPass).toBe(true);
      expect(uniquenessPass).toBe(true);

      // Step 6: Examine specific quality metrics
      if (report.arrayLengthComparison.tags) {
        const tagsComparison = report.arrayLengthComparison.tags;
        console.log('Tags array comparison:');
        console.log(`  Sample p50: ${tagsComparison.sample.p50Len}`);
        console.log(`  Generated p50: ${tagsComparison.generated.p50Len}`);
        console.log(`  Deviation: ${tagsComparison.deviation.p50.toFixed(2)}%`);
        console.log(`  Passed: ${tagsComparison.passed}`);
      }

      // Step 7: Check document size distribution
      const sizePassed = report.documentSizeComparison.buckets.every((b) => b.passed);
      console.log(`Document size distribution passed: ${sizePassed}`);
    });
  });
});
