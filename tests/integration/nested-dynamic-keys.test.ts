
import { describe, it, expect } from 'vitest';
import { Inferencer } from '../../src/lib/inferencer/index.js';
import { Profiler } from '../../src/lib/profiler/index.js';
import { Synthesizer } from '../../src/lib/synthesizer/index.js';
import { preprocessSchema } from '../../src/lib/generator/schema-preprocessor.js';
import { Generator } from '../../src/lib/generator/index.js';
import { Normalizer } from '../../src/lib/normalizer/index.js';

describe('Nested Dynamic Keys Support', () => {
  const commonConfig = {
    threshold: 5,
    patterns: [
      { name: 'UUID', regex: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
    ],
    minPatternMatch: 0.8,
    confidenceThreshold: 0.7,
    forceStaticPaths: [],
    forceDynamicPaths: []
  };

  it('should detect and expand 2-level nested dynamic keys', async () => {
    const documents = [];
    // 10 documents, each with 5 UUID keys at Level 1,
    // and each of those has 5 UUID keys at Level 2
    for (let i = 0; i < 10; i++) {
      const l1Obj = {};
      for (let j = 0; j < 5; j++) {
        // Last part: 12 chars. i (2) + j (2) + k (8)
        const uuidL1 = `11111111-1111-4111-8111-${i.toString().padStart(2, '0')}${j.toString().padStart(2, '0')}00000000`;
        const l2Obj = {};
        for (let k = 0; k < 5; k++) {
          const uuidL2 = `22222222-2222-4222-8222-${i.toString().padStart(2, '0')}${j.toString().padStart(2, '0')}${k.toString().padStart(8, '0')}`;
          l2Obj[uuidL2] = { val: i + j + k };
        }
        l1Obj[uuidL1] = l2Obj;
      }
      documents.push({ _id: `id${i}`, a: l1Obj, __typeHints: {} });
    }

    const normalizer = new Normalizer();
    const { documents: normalized } = normalizer.normalize(documents);

    const inferencer = new Inferencer();
    const result = await inferencer.infer(normalized);

    const profiler = new Profiler({ dynamicKeyDetection: commonConfig });
    const { profile: constraints } = profiler.profile(normalized);
    const dynamicKeyAnalyses = constraints.dynamicKeyStats;

    // Level 1 should be detected
    const l1Analysis = dynamicKeyAnalyses?.get('a');
    expect(l1Analysis?.isDynamic).toBe(true);

    const l1ValueSchema = l1Analysis?.valueSchema.schemas[0];
    expect(l1ValueSchema['x-dynamic-keys']).toBeDefined();
    expect(l1ValueSchema['x-dynamic-keys'].metadata.pattern).toBe('UUID');

    // Synthesize generation schema
    const synthesizer = new Synthesizer();
    const { schema: generationSchema } = synthesizer.synthesize(
      result.schema,
      constraints,
      new Map()
    );

    // Now test expansion
    const preprocessed = preprocessSchema(generationSchema, { seed: 42 });

    // Root properties should have 'a'
    const aProps = preprocessed.properties.a.properties;
    expect(Object.keys(aProps).length).toBeGreaterThan(0);

    // Pick one generated key from 'a'
    const firstKey = Object.keys(aProps)[0];
    const innerObj = aProps[firstKey];

    // It should have expanded properties from Level 2
    expect(innerObj.properties).toBeDefined();
    const l2Keys = Object.keys(innerObj.properties);
    expect(l2Keys.length).toBeGreaterThan(0);

    // The keys should match UUID pattern
    expect(l2Keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should handle complex static structures under dynamic keys', async () => {
    const documents = [];
    for (let i = 0; i < 10; i++) {
      const l1Obj = {};
      for (let j = 0; j < 5; j++) {
        const uuid = `550e8400-e29b-41d4-a716-4466554400${i.toString().padStart(1, '0')}${j.toString().padStart(1, '0')}`;
        l1Obj[uuid] = {
          user: {
            profile: {
              settings: {
                theme: 'dark',
                notifications: true
              }
            }
          }
        };
      }
      documents.push({ _id: `id${i}`, a: l1Obj, __typeHints: {} });
    }

    const normalizer = new Normalizer();
    const { documents: normalized } = normalizer.normalize(documents);

    const inferencer = new Inferencer();
    const result = await inferencer.infer(normalized);

    const profiler = new Profiler({ dynamicKeyDetection: commonConfig });
    const { profile: constraints } = profiler.profile(normalized);
    const dynamicKeyAnalyses = constraints.dynamicKeyStats;

    const l1Analysis = dynamicKeyAnalyses?.get('a');
    const innerSchema = l1Analysis?.valueSchema.schemas[0];

    // Should have deep static structure (inferred from sample)
    expect(innerSchema.properties.user.properties.profile.properties.settings.properties.theme).toBeDefined();

    // Synthesize
    const synthesizer = new Synthesizer();
    const { schema: generationSchema } = synthesizer.synthesize(
      result.schema,
      constraints,
      new Map()
    );

    // Test generation
    const generator = new Generator({ schema: generationSchema, constraints: {} as any, seed: 42, useDynamicKeys: true });
    const docs = await generator.generate(1);
    const doc = docs[0];

    const firstAKey = Object.keys(doc.a)[0];
    expect(doc.a[firstAKey].user.profile.settings.theme).toBe('dark');
  });
});
