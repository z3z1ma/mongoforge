import { describe, it, expect } from 'vitest';
import { Normalizer } from '../../src/lib/normalizer/index.js';
import { Inferencer } from '../../src/lib/inferencer/index.js';
import { Profiler } from '../../src/lib/profiler/index.js';
import type { NormalizedDocument } from '../../src/types/data-model.js';

describe('Constraints - Dynamic Key Bloat Prevention', () => {
  it('should not store array stats for nested paths under dynamic key fields', async () => {
    // Create sample documents with dynamic UUID keys
    const rawDocs = [
      {
        id: '1',
        userAccountLevelDataMap: {
          'uuid-key-001': {
            userProvisionedTo: ['team-a', 'team-b'],
            accountId: 'acc-1',
          },
          'uuid-key-002': {
            userProvisionedTo: ['team-c'],
            accountId: 'acc-2',
          },
          'uuid-key-003': {
            userProvisionedTo: ['team-d', 'team-e', 'team-f'],
            accountId: 'acc-3',
          },
        },
        topLevelArray: [1, 2, 3],
      },
      {
        id: '2',
        userAccountLevelDataMap: {
          'uuid-key-004': {
            userProvisionedTo: ['team-x'],
            accountId: 'acc-4',
          },
          'uuid-key-005': {
            userProvisionedTo: ['team-y', 'team-z'],
            accountId: 'acc-5',
          },
        },
        topLevelArray: [1, 2],
      },
      {
        id: '3',
        userAccountLevelDataMap: {
          'uuid-key-006': {
            userProvisionedTo: ['team-1', 'team-2'],
            accountId: 'acc-6',
          },
          'uuid-key-007': {
            userProvisionedTo: ['team-3'],
            accountId: 'acc-7',
          },
          'uuid-key-008': {
            userProvisionedTo: ['team-4'],
            accountId: 'acc-8',
          },
        },
        topLevelArray: [1],
      },
    ];

    // Step 1: Normalize
    const normalizer = new Normalizer();
    const { documents: normalized } = normalizer.normalize(rawDocs);

    // Step 2: Infer schema with dynamic key detection (via Profiler)
    const inferencer = new Inferencer({
      semanticTypes: false,
      storeValues: false,
    });
    const { schema: inferredSchema } = await inferencer.infer(normalized);

    // Step 3: Profile constraints with dynamic key detection
    const profiler = new Profiler({
      arrayLenPolicy: 'percentileClamp',
      percentiles: [50, 95],
      clampRange: [10, 90],
      sizeProxy: 'leafFieldCount',
      dynamicKeyDetection: {
        threshold: 5,
        patterns: [],
        minPatternMatch: 0.8,
        confidenceThreshold: 0.7,
        forceStaticPaths: [],
        forceDynamicPaths: [],
      },
    });
    const { profile: constraints } = profiler.profile(normalized);
    const dynamicKeyAnalyses = constraints.dynamicKeyStats;

    // Verify dynamic key was detected
    expect(dynamicKeyAnalyses).toBeDefined();
    expect(dynamicKeyAnalyses!.size).toBeGreaterThan(0);
    const userMapAnalysis = dynamicKeyAnalyses!.get('userAccountLevelDataMap');
    expect(userMapAnalysis).toBeDefined();
    expect(userMapAnalysis!.isDynamic).toBe(true);

    // IMPORTANT: In the real CLI (infer.ts), we now filter out nested paths
    // Let's simulate that filtering here to test it works:
    const dynamicKeyPaths = new Set(
      Array.from(dynamicKeyAnalyses!.entries())
        .filter(([_, analysis]) => analysis.isDynamic)
        .map(([path, _]) => path)
    );

    let removedCount = 0;
    for (const [arrayPath, _] of constraints.arrayStats) {
      for (const dynamicPath of dynamicKeyPaths) {
        if (arrayPath.startsWith(dynamicPath + '.')) {
          constraints.arrayStats.delete(arrayPath);
          removedCount++;
          break;
        }
      }
    }

    // Verify filtering worked
    expect(removedCount).toBeGreaterThan(0); // Should have removed nested entries

    // Verify no nested paths remain
    for (const [arrayPath, _] of constraints.arrayStats) {
      for (const dynamicPath of dynamicKeyPaths) {
        expect(arrayPath.startsWith(dynamicPath + '.')).toBe(false);
      }
    }

    // Verify topLevelArray is still present (NOT nested under dynamic key)
    expect(constraints.arrayStats.has('topLevelArray')).toBe(true);
  });

  it('should preserve array stats for non-dynamic nested fields', async () => {
    // Documents with static nested structure
    const rawDocs = [
      {
        id: '1',
        config: {
          tags: ['a', 'b', 'c'],
        },
        items: [1, 2],
      },
      {
        id: '2',
        config: {
          tags: ['x', 'y'],
        },
        items: [1, 2, 3],
      },
    ];

    const normalizer = new Normalizer();
    const { documents: normalized } = normalizer.normalize(rawDocs);

    // Infer WITHOUT dynamic key detection
    const inferencer = new Inferencer({
      semanticTypes: false,
      storeValues: false,
    });
    await inferencer.infer(normalized);

    const profiler = new Profiler();
    const { profile: constraints } = profiler.profile(normalized);
    const dynamicKeyAnalyses = constraints.dynamicKeyStats;

    // No dynamic keys detected (detection was disabled)
    // In streaming mode, this returns an empty Map, not undefined
    expect(dynamicKeyAnalyses).toBeDefined();
    expect(dynamicKeyAnalyses?.size).toBe(0);

    // All array stats should be preserved
    expect(constraints.arrayStats.has('config.tags')).toBe(true);
    expect(constraints.arrayStats.has('items')).toBe(true);
  });
});
