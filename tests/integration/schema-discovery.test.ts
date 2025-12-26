/**
 * Integration test for Phase 5: Schema Discovery and Export
 * Demonstrates how to use the inferencer, synthesizer, and CLI APIs
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, Db } from 'mongodb';
import { Sampler } from '../../src/lib/sampler/index.js';
import { Normalizer } from '../../src/lib/normalizer/index.js';
import { Inferencer } from '../../src/lib/inferencer/index.js';
import { Profiler } from '../../src/lib/profiler/index.js';
import { Synthesizer } from '../../src/lib/synthesizer/index.js';
import { extractFieldPaths, getArrayFieldPaths } from '../../src/lib/inferencer/mongodb-schema-wrapper.js';
import { buildXGenExtensions } from '../../src/lib/synthesizer/vendor-keywords.js';

describe('Phase 5: Schema Discovery Integration', () => {
  let mongoServer: MongoMemoryServer;
  let mongoUri: string;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db('testdb');

    // Insert sample documents
    await db.collection('users').insertMany([
      {
        _id: new ObjectId(),
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
        tags: ['admin', 'developer'],
        createdAt: new Date('2024-01-01'),
        profile: {
          bio: 'Software engineer',
          location: 'San Francisco',
        },
      },
      {
        _id: new ObjectId(),
        name: 'Bob',
        email: 'bob@example.com',
        age: 25,
        tags: ['developer'],
        createdAt: new Date('2024-01-02'),
        profile: {
          bio: 'Full stack developer',
          location: 'New York',
        },
      },
      {
        _id: new ObjectId(),
        name: 'Charlie',
        email: 'charlie@example.com',
        age: 35,
        tags: ['admin', 'manager', 'developer'],
        createdAt: new Date('2024-01-03'),
        profile: {
          bio: 'Engineering manager',
          location: 'Austin',
        },
      },
      {
        _id: new ObjectId(),
        name: 'Diana',
        email: 'diana@example.com',
        age: 28,
        tags: ['designer'],
        createdAt: new Date('2024-01-04'),
        profile: {
          bio: 'UX designer',
          location: 'Seattle',
        },
      },
      {
        _id: new ObjectId(),
        name: 'Eve',
        email: 'eve@example.com',
        age: 32,
        tags: ['developer', 'architect'],
        createdAt: new Date('2024-01-05'),
        profile: {
          bio: 'Solutions architect',
          location: 'Boston',
        },
      },
    ]);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('demonstrates complete schema discovery workflow', async () => {
    /**
     * STEP 1: Sample documents from MongoDB
     * Shows how to use the Sampler API
     */
    const sampler = new Sampler();
    const samplerResult = await sampler.sample({
      uri: mongoUri,
      database: 'testdb',
      collection: 'users',
      sampleSize: 5,
      strategy: 'firstN',
    });

    const samples = samplerResult.documents;
    expect(samples).toHaveLength(5);
    expect(samples[0]).toHaveProperty('_id');
    expect(samples[0]).toHaveProperty('__metadata');
    expect(samples[0].__metadata.collectionName).toBe('users');

    /**
     * STEP 2: Normalize documents (convert BSON types to JSON Schema types)
     * Shows how to use the Normalizer API
     */
    const normalizer = new Normalizer();
    const { documents: normalized, typeHints } = normalizer.normalize(samples);

    expect(normalized).toHaveLength(5);
    expect(normalized[0]._id).toBeTypeOf('string'); // ObjectId converted to string
    expect(normalized[0]).toHaveProperty('__typeHints');
    expect(typeHints.size).toBeGreaterThan(0);

    // Verify type hints preserve MongoDB type information
    const idTypeHint = typeHints.get('_id');
    expect(idTypeHint).toBeDefined();
    expect(idTypeHint?.originalType).toBe('ObjectId');
    expect(idTypeHint?.jsonSchemaFormat).toBe('objectid');

    const createdAtTypeHint = typeHints.get('createdAt');
    expect(createdAtTypeHint).toBeDefined();
    expect(createdAtTypeHint?.originalType).toBe('Date');
    expect(createdAtTypeHint?.jsonSchemaFormat).toBe('date-time');

    /**
     * STEP 3: Infer schema from normalized documents
     * Shows how to use the Inferencer API
     */
    const inferencer = new Inferencer({
      semanticTypes: false,
      storeValues: false,
    });

    const { schema: inferredSchema, metadata: inferMeta } = await inferencer.infer(normalized);

    expect(inferredSchema.count).toBe(5);
    expect(Object.keys(inferredSchema.fields).length).toBeGreaterThan(0);
    expect(inferMeta.documentsAnalyzed).toBe(5);
    expect(inferMeta.fieldsDiscovered).toBeGreaterThan(0);

    // Verify inferred schema structure
    expect(inferredSchema.fields).toHaveProperty('_id');
    expect(inferredSchema.fields).toHaveProperty('name');
    expect(inferredSchema.fields).toHaveProperty('email');
    expect(inferredSchema.fields).toHaveProperty('tags');
    expect(inferredSchema.fields).toHaveProperty('profile');

    /**
     * STEP 4: Extract field paths (JSONPath-style)
     * Shows how to use field path extraction utilities
     */
    const fieldPaths = extractFieldPaths(inferredSchema);

    expect(fieldPaths.size).toBeGreaterThan(0);
    expect(fieldPaths.has('_id')).toBe(true);
    expect(fieldPaths.has('name')).toBe(true);
    expect(fieldPaths.has('tags')).toBe(true);
    expect(fieldPaths.has('profile')).toBe(true);
    expect(fieldPaths.has('profile.bio')).toBe(true);
    expect(fieldPaths.has('profile.location')).toBe(true);

    // Get array field paths with observed lengths
    const arrayPaths = getArrayFieldPaths(inferredSchema);
    expect(arrayPaths.has('tags')).toBe(true);
    expect(arrayPaths.get('tags')).toBeDefined();

    /**
     * STEP 5: Profile constraints (array stats, size buckets)
     * Shows how to use the Profiler API
     */
    const profiler = new Profiler({
      arrayLenPolicy: 'percentileClamp',
      percentiles: [50, 90, 99],
      clampRange: [1, 99],
      sizeProxy: 'leafFieldCount',
    });

    const { profile: constraints, metadata: profileMeta } = profiler.profile(normalized);

    expect(constraints.arrayStats.size).toBeGreaterThan(0);
    expect(constraints.sizeBuckets.length).toBeGreaterThan(0);
    expect(profileMeta.documentsAnalyzed).toBe(5);
    expect(profileMeta.arrayFieldsFound).toBeGreaterThan(0);

    // Verify array statistics
    const tagsStats = constraints.arrayStats.get('tags');
    expect(tagsStats).toBeDefined();
    expect(tagsStats?.minLen).toBeGreaterThanOrEqual(0);
    expect(tagsStats?.maxLen).toBeGreaterThan(0);
    expect(tagsStats?.p50Len).toBeDefined();
    expect(tagsStats?.p90Len).toBeDefined();
    expect(tagsStats?.p99Len).toBeDefined();

    /**
     * STEP 6: Build x-gen vendor extensions
     * Shows how to use vendor keyword utilities
     */
    const xGenForId = buildXGenExtensions({
      fieldPath: '_id',
      isKeyField: true,
      typeHint: typeHints.get('_id'),
    });

    expect(xGenForId).toBeDefined();
    expect(xGenForId?.key).toBe(true);
    expect(xGenForId?.mongoType).toBe('ObjectId');

    const xGenForTags = buildXGenExtensions({
      fieldPath: 'tags',
      arrayStats: tagsStats,
      arrayLenStrategy: 'percentile',
    });

    expect(xGenForTags).toBeDefined();
    expect(xGenForTags?.arrayLen).toBeDefined();
    expect(xGenForTags?.arrayLen?.strategy).toBe('percentile');
    expect(xGenForTags?.arrayLen?.p50).toBeDefined();

    /**
     * STEP 7: Synthesize GenerationSchema
     * Shows how to use the Synthesizer API to transform InferredSchema → GenerationSchema
     */
    const synthesizer = new Synthesizer({
      enforceRequired: true,
      includeMetadata: true,
    });

    const { schema: generationSchema, metadata: synthMeta } = synthesizer.synthesize(
      inferredSchema,
      constraints,
      typeHints
    );

    expect(generationSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(generationSchema.type).toBe('object');
    expect(generationSchema.properties).toBeDefined();
    expect(generationSchema.required).toContain('_id');
    expect(synthMeta.fieldsProcessed).toBeGreaterThan(0);
    expect(synthMeta.vendorExtensionsApplied).toBeGreaterThan(0);

    // Verify _id field has x-gen.key extension
    const idProperty = generationSchema.properties._id;
    expect(idProperty).toBeDefined();
    expect(idProperty.type).toBe('string');
    expect(idProperty.format).toBe('objectid');
    expect(idProperty['x-gen']?.key).toBe(true);
    expect(idProperty['x-gen']?.mongoType).toBe('ObjectId');

    // Verify createdAt field has x-gen.mongoType extension
    const createdAtProperty = generationSchema.properties.createdAt;
    expect(createdAtProperty).toBeDefined();
    expect(createdAtProperty.type).toBe('string');
    expect(createdAtProperty.format).toBe('date-time');
    expect(createdAtProperty['x-gen']?.mongoType).toBe('Date');

    // Verify tags array field has x-gen.arrayLen extension and minItems/maxItems
    const tagsProperty = generationSchema.properties.tags;
    expect(tagsProperty).toBeDefined();
    expect(tagsProperty.type).toBe('array');
    expect(tagsProperty.items).toBeDefined();
    expect(tagsProperty.minItems).toBeDefined();
    expect(tagsProperty.maxItems).toBeDefined();
    expect(tagsProperty['x-gen']?.arrayLen).toBeDefined();
    expect(tagsProperty['x-gen']?.arrayLen?.min).toBeGreaterThanOrEqual(0);
    expect(tagsProperty['x-gen']?.arrayLen?.max).toBeGreaterThan(0);

    // Verify nested profile object
    const profileProperty = generationSchema.properties.profile;
    expect(profileProperty).toBeDefined();
    expect(profileProperty.type).toBe('object');
    expect(profileProperty.properties).toBeDefined();
    expect(profileProperty.properties?.bio).toBeDefined();
    expect(profileProperty.properties?.location).toBeDefined();

    /**
     * STEP 8: Verify complete workflow produces valid artifacts
     */
    expect(inferredSchema).toBeDefined();
    expect(constraints).toBeDefined();
    expect(generationSchema).toBeDefined();

    // Verify generation schema is ready for json-schema-faker
    expect(generationSchema.properties._id.format).toBe('objectid');
    expect(generationSchema.properties.email.type).toBe('string');
    expect(generationSchema.additionalProperties).toBe(true);
  });

  it('demonstrates CLI programmatic usage', async () => {
    /**
     * Shows how the CLI infer command works internally
     * This demonstrates the complete workflow as it would be executed by:
     * mongoforge infer --source-uri <uri> --source-db testdb --source-collection users
     */

    // Step 1: Sample
    const sampler = new Sampler();
    const samplerResult = await sampler.sample({
      uri: mongoUri,
      database: 'testdb',
      collection: 'users',
      sampleSize: 5,
      strategy: 'random',
    });

    const samples = samplerResult.documents;
    expect(samples.length).toBeGreaterThan(0);

    // Step 2: Normalize
    const normalizer = new Normalizer();
    const { documents: normalized, typeHints } = normalizer.normalize(samples);

    // Step 3: Infer
    const inferencer = new Inferencer();
    const { schema: inferredSchema } = await inferencer.infer(normalized);

    // Step 4: Profile
    const profiler = new Profiler();
    const { profile: constraints } = profiler.profile(normalized);

    // Step 5: Synthesize
    const synthesizer = new Synthesizer();
    const { schema: generationSchema } = synthesizer.synthesize(
      inferredSchema,
      constraints,
      typeHints
    );

    // Verify output matches CLI contract
    const cliOutput = {
      status: 'success',
      phase: 'discovery',
      artifacts: {
        inferredSchema: './output/inferred.schema.json',
        generationSchema: './output/generation.schema.json',
        constraints: './output/constraints.json',
      },
      summary: {
        sampledDocuments: samples.length,
        fieldsInferred: Object.keys(inferredSchema.fields).length,
        arrayPathsTracked: constraints.arrayStats.size,
        durationMs: 0, // Would be calculated in real CLI
      },
    };

    expect(cliOutput.status).toBe('success');
    expect(cliOutput.phase).toBe('discovery');
    expect(cliOutput.summary.sampledDocuments).toBe(samples.length);
    expect(cliOutput.summary.fieldsInferred).toBeGreaterThan(0);
  });

  it('demonstrates handling of additional key fields', async () => {
    /**
     * Shows how to configure additional key fields beyond _id
     */
    const sampler = new Sampler();
    const samplerResult = await sampler.sample({
      uri: mongoUri,
      database: 'testdb',
      collection: 'users',
      sampleSize: 5,
      strategy: 'firstN',
    });

    const samples = samplerResult.documents;
    const normalizer = new Normalizer();
    const { documents: normalized, typeHints } = normalizer.normalize(samples);

    const inferencer = new Inferencer();
    const { schema: inferredSchema } = await inferencer.infer(normalized);

    const profiler = new Profiler();
    const { profile: constraints } = profiler.profile(normalized);

    // Configure additional key fields (e.g., email should be unique)
    constraints.keyFields.additionalKeys.push({
      fieldPath: 'email',
      type: 'string',
      enforceUniqueness: true,
      uniquenessScope: 'run',
    });

    const synthesizer = new Synthesizer();
    const { schema: generationSchema } = synthesizer.synthesize(
      inferredSchema,
      constraints,
      typeHints
    );

    // Verify email is in required fields
    expect(generationSchema.required).toContain('_id');
    expect(generationSchema.required).toContain('email');

    // Verify email has x-gen.key extension
    const emailProperty = generationSchema.properties.email;
    expect(emailProperty['x-gen']?.key).toBe(true);
  });
});
