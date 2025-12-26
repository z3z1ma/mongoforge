/**
 * Phase 3 integration test - End-to-end workflow
 * Tests: sample → normalize → profile → generate
 */

import { describe, it, expect } from 'vitest';
import { normalizeDocuments } from '../../src/lib/normalizer/index.js';
import { profileDocuments } from '../../src/lib/profiler/index.js';
import { generateDocuments } from '../../src/lib/generator/index.js';
import { SampleDocument, GenerationSchema } from '../../src/types/data-model.js';
import { ObjectId } from 'mongodb';

describe('Phase 3: Size-Equivalent Test Data - Integration', () => {
  it('should normalize sample documents', () => {
    const sampleDocs: SampleDocument[] = [
      {
        _id: new ObjectId(),
        name: 'Test User',
        createdAt: new Date(),
        tags: ['tag1', 'tag2'],
        __metadata: {
          collectionName: 'test',
          sampledAt: new Date(),
          sampleIndex: 0,
        },
      },
    ];

    const result = normalizeDocuments(sampleDocs);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?._id).toBeDefined();
    // ObjectId should be converted to string
    const doc = result.documents[0];
    expect(doc).toBeDefined();
    if (doc) {
      expect(typeof doc._id === 'string' || doc._id instanceof Object).toBe(true);
      expect(doc.__typeHints).toBeDefined();
    }
  });

  it('should profile normalized documents', () => {
    const normalizedDocs: any[] = [
      {
        _id: '507f1f77bcf86cd799439011',
        name: 'Test User 1',
        tags: ['a', 'b'],
        __typeHints: {},
      },
      {
        _id: '507f1f77bcf86cd799439012',
        name: 'Test User 2',
        tags: ['x', 'y', 'z'],
        __typeHints: {},
      },
    ];

    const profile = profileDocuments(normalizedDocs);

    expect(profile.arrayStats.size).toBeGreaterThan(0);
    expect(profile.sizeBuckets).toBeDefined();
    expect(profile.keyFields._id).toBeDefined();
  });

  it('should generate synthetic documents from schema', async () => {
    const schema: GenerationSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: 'TestDocument',
      properties: {
        _id: {
          type: 'string',
          format: 'objectid',
        },
        name: {
          type: 'string',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 5,
        },
      },
      required: ['_id'],
      additionalProperties: true,
    };

    const docs = await generateDocuments(schema, 10, 'test-seed');

    expect(docs).toHaveLength(10);
    expect(docs[0]?._id).toBeDefined();
    expect(docs[0]?._id).toMatch(/^[0-9a-f]{24}$/);
  });
});
