
import { describe, it, expect, beforeEach } from 'vitest';
import { inferSchema } from '../../src/lib/inferencer/mongodb-schema-wrapper.js';
import { synthesize } from '../../src/lib/synthesizer/index.js';
import { generateMany, initializeFaker } from '../../src/lib/generator/faker-engine.js';
import { Profiler } from '../../src/lib/profiler/index.js';
import { NormalizedDocument } from '../../src/types/data-model.js';

describe('Enum Generation - Integration', () => {
  beforeEach(() => {
    initializeFaker(12345);
  });

  it('should detect enums and preserve distribution', async () => {
    // 1. Create sample data with known distribution
    // 50 "A", 30 "B", 20 "C"
    const documents: NormalizedDocument[] = [];
    
    for (let i = 0; i < 50; i++) documents.push({ _id: `id_${i}`, status: 'A', __typeHints: {} });
    for (let i = 0; i < 30; i++) documents.push({ _id: `id_${50+i}`, status: 'B', __typeHints: {} });
    for (let i = 0; i < 20; i++) documents.push({ _id: `id_${80+i}`, status: 'C', __typeHints: {} });

    // 2. Infer schema
    const inferredSchema = await inferSchema(documents, { storeValues: true });

    // Verify inference caught the distribution
    const statusField = inferredSchema.fields['status'];
    const stringType = statusField.types.find(t => t.name === 'String');
    expect(stringType?.valueDistribution).toBeDefined();
    expect(stringType?.valueDistribution!['A']).toBe(50);
    expect(stringType?.valueDistribution!['B']).toBe(30);
    expect(stringType?.valueDistribution!['C']).toBe(20);

    // 3. Profile
    const profiler = new Profiler();
    const { profile: constraints } = profiler.profile(documents);

    // 4. Synthesize
    const generationSchema = synthesize(inferredSchema, constraints, new Map());

    // Verify generation schema has x-gen.enum
    const prop = generationSchema.properties['status'];
    expect(prop['x-gen']?.enum).toBeDefined();
    expect(prop['x-gen']?.enum?.distribution).toEqual({
        'A': 50,
        'B': 30,
        'C': 20
    });

    // 5. Generate
    const generatedDocs = await generateMany(generationSchema, 1000, { seed: 999 });

    // 6. Verify generated distribution
    let countA = 0;
    let countB = 0;
    let countC = 0;

    for (const doc of generatedDocs) {
        if (doc.status === 'A') countA++;
        else if (doc.status === 'B') countB++;
        else if (doc.status === 'C') countC++;
    }

    // Should be roughly 500, 300, 200. Allow 10% tolerance
    expect(countA).toBeGreaterThan(450);
    expect(countA).toBeLessThan(550);
    expect(countB).toBeGreaterThan(250);
    expect(countB).toBeLessThan(350);
    expect(countC).toBeGreaterThan(150);
    expect(countC).toBeLessThan(250);
  });

  it('should handle numeric enums', async () => {
    // 50 x 1, 50 x 2
    const documents: NormalizedDocument[] = [];
    for (let i = 0; i < 50; i++) documents.push({ _id: `id_${i}`, rank: 1, __typeHints: {} });
    for (let i = 0; i < 50; i++) documents.push({ _id: `id_${50+i}`, rank: 2, __typeHints: {} });

    const inferredSchema = await inferSchema(documents, { storeValues: true });
    const profiler = new Profiler();
    const { profile: constraints } = profiler.profile(documents);
    const generationSchema = synthesize(inferredSchema, constraints, new Map());

    const prop = generationSchema.properties['rank'];
    expect(prop['x-gen']?.enum).toBeDefined();
    // Frequency map keys are strings
    expect(prop['x-gen']?.enum?.distribution).toEqual({
        '1': 50,
        '2': 50
    });

    const generatedDocs = await generateMany(generationSchema, 100, { seed: 123 });
    
    // Check types
    expect(typeof generatedDocs[0].rank).toBe('number');

    let count1 = 0;
    for (const doc of generatedDocs) {
        if (doc.rank === 1) count1++;
    }

    expect(count1).toBeGreaterThan(40);
    expect(count1).toBeLessThan(60);
  });
});
