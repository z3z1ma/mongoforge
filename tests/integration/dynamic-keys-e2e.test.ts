/**
 * Dynamic Keys End-to-End Integration Tests
 * Feature: 002-dynamic-key-inference
 *
 * Tests the complete pipeline: schema inference → dynamic key detection →
 * schema preprocessing → document generation with dynamic keys
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Normalizer } from '../../src/lib/normalizer/index.js';
import { Inferencer } from '../../src/lib/inferencer/index.js';
import { Profiler } from '../../src/lib/profiler/index.js';
import { Synthesizer } from '../../src/lib/synthesizer/index.js';
import { preprocessSchema } from '../../src/lib/generator/schema-preprocessor.js';
import { generate } from '../../src/lib/generator/faker-engine.js';
import { initializeFaker } from '../../src/lib/generator/faker-engine.js';
import type { GeneratedSchema } from '../../src/types/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Dynamic Keys - End-to-End Pipeline', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  describe('UUID-based Dynamic Keys Pipeline', () => {
    it('should detect, infer, and generate documents with UUID-based dynamic keys', async () => {
      // 1. Load fixture data
      const fixtureData = JSON.parse(
        readFileSync(join(fixturesDir, 'dynamic-keys-uuid.json'), 'utf-8')
      );

      // 2. Normalize documents
      const normalizer = new Normalizer();
      const { documents: normalized, typeHints } = normalizer.normalize(
        fixtureData.map((doc: any) => ({
          ...doc,
          __metadata: { collectionName: 'test', database: 'test' },
        }))
      );

      // 3. Infer schema with dynamic key detection enabled
      // Use lower threshold for test fixtures (8-12 keys)
      const inferencer = new Inferencer({
        dynamicKeyDetection: {
          threshold: 5, // Lower than fixture key count (8-12)
          patterns: [
            { name: 'UUID', regex: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
            { name: 'MONGODB_OBJECTID', regex: '^[0-9a-f]{24}$' },
            { name: 'ULID', regex: '^[0-9A-Z]{26}$' },
            { name: 'NUMERIC_ID', regex: '^\\d{6,20}$' },
            { name: 'PREFIXED_ID', regex: '^(user|doc|item|order)_[a-z0-9]{8,32}$' },
          ],
          minPatternMatch: 0.8,
          confidenceThreshold: 0.7,
          forceStaticPaths: [],
          forceDynamicPaths: [],
        },
      });
      const { schema: inferredSchema, dynamicKeyAnalyses } =
        await inferencer.infer(normalized);

      // Verify dynamic keys were detected in accountBalances
      expect(dynamicKeyAnalyses).toBeDefined();
      expect(dynamicKeyAnalyses!.size).toBeGreaterThan(0);

      // Check for accountBalances field analysis
      const accountBalancesAnalysis = dynamicKeyAnalyses!.get('accountBalances');
      expect(accountBalancesAnalysis).toBeDefined();
      expect(accountBalancesAnalysis?.isDynamic).toBe(true);
      expect(accountBalancesAnalysis?.detection?.pattern).toBe('UUID');

      // 4. Profile constraints
      const profiler = new Profiler();
      const { profile: constraints } = profiler.profile(normalized);

      // 5. Synthesize generation schema
      const synthesizer = new Synthesizer();
      const generationSchema = synthesizer.synthesize(
        inferredSchema,
        constraints,
        typeHints,
        dynamicKeyAnalyses
      );

      // 6. Preprocess schema for generation
      // Need to pass the actual schema object, not the wrapper
      const preprocessedSchema = preprocessSchema(generationSchema.schema);

      // 7. Generate synthetic documents
      initializeFaker(12345);

      const syntheticDocs = [];
      for (let i = 0; i < 10; i++) {
        const doc = await generate(preprocessedSchema);
        syntheticDocs.push(doc);
      }

      // 8. Validate generated documents
      expect(syntheticDocs).toHaveLength(10);

      syntheticDocs.forEach((doc) => {
        expect(doc.accountBalances).toBeDefined();
        expect(typeof doc.accountBalances).toBe('object');

        const keys = Object.keys(doc.accountBalances);

        // Should have realistic number of keys based on observed distribution
        expect(keys.length).toBeGreaterThanOrEqual(8);
        expect(keys.length).toBeLessThanOrEqual(12);

        // All keys should be valid UUIDs
        keys.forEach((key) => {
          expect(key).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );

          // Values should be numbers (matching original data)
          expect(typeof doc.accountBalances[key]).toBe('number');
        });
      });
    });
  });

  describe('ObjectId-based Dynamic Keys Pipeline', () => {
    it('should detect, infer, and generate documents with ObjectId-based dynamic keys', async () => {
      // 1. Load fixture data
      const fixtureData = JSON.parse(
        readFileSync(join(fixturesDir, 'dynamic-keys-objectid.json'), 'utf-8')
      );

      // 2. Normalize documents
      const normalizer = new Normalizer();
      const { documents: normalized, typeHints } = normalizer.normalize(
        fixtureData.map((doc: any) => ({
          ...doc,
          __metadata: { collectionName: 'test', database: 'test' },
        }))
      );

      // 3. Infer schema with dynamic key detection enabled
      // Use lower threshold for test fixtures (8-12 keys)
      const inferencer = new Inferencer({
        dynamicKeyDetection: {
          threshold: 5, // Lower than fixture key count (8-12)
          patterns: [
            { name: 'UUID', regex: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
            { name: 'MONGODB_OBJECTID', regex: '^[0-9a-f]{24}$' },
            { name: 'ULID', regex: '^[0-9A-Z]{26}$' },
            { name: 'NUMERIC_ID', regex: '^\\d{6,20}$' },
            { name: 'PREFIXED_ID', regex: '^(user|doc|item|order)_[a-z0-9]{8,32}$' },
          ],
          minPatternMatch: 0.8,
          confidenceThreshold: 0.7,
          forceStaticPaths: [],
          forceDynamicPaths: [],
        },
      });
      const { schema: inferredSchema, dynamicKeyAnalyses } =
        await inferencer.infer(normalized);

      // Verify dynamic keys were detected in taskOwners
      expect(dynamicKeyAnalyses).toBeDefined();
      expect(dynamicKeyAnalyses!.size).toBeGreaterThan(0);

      const taskOwnersAnalysis = dynamicKeyAnalyses!.get('taskOwners');
      expect(taskOwnersAnalysis).toBeDefined();
      expect(taskOwnersAnalysis?.isDynamic).toBe(true);
      expect(taskOwnersAnalysis?.detection?.pattern).toBe('MONGODB_OBJECTID');

      // 4. Profile constraints
      const profiler = new Profiler();
      const { profile: constraints } = profiler.profile(normalized);

      // 5. Synthesize generation schema
      const synthesizer = new Synthesizer();
      const generationSchema = synthesizer.synthesize(
        inferredSchema,
        constraints,
        typeHints,
        dynamicKeyAnalyses
      );

      // 6. Preprocess schema for generation
      // Need to pass the actual schema object, not the wrapper
      const preprocessedSchema = preprocessSchema(generationSchema.schema);

      // 7. Generate synthetic documents
      initializeFaker(54321);
      const syntheticDocs = [];
      for (let i = 0; i < 5; i++) {
        const doc = await generate(preprocessedSchema);
        syntheticDocs.push(doc);
      }

      // 8. Validate generated documents
      expect(syntheticDocs).toHaveLength(5);

      syntheticDocs.forEach((doc) => {
        expect(doc.taskOwners).toBeDefined();
        expect(typeof doc.taskOwners).toBe('object');

        const keys = Object.keys(doc.taskOwners);

        // Should have realistic number of keys
        expect(keys.length).toBeGreaterThanOrEqual(8);
        expect(keys.length).toBeLessThanOrEqual(12);

        // All keys should be valid ObjectIds
        keys.forEach((key) => {
          expect(key).toMatch(/^[0-9a-f]{24}$/i);

          // Values should be objects with expected structure
          expect(typeof doc.taskOwners[key]).toBe('object');
          expect(doc.taskOwners[key]).toHaveProperty('name');
          expect(doc.taskOwners[key]).toHaveProperty('role');
          expect(doc.taskOwners[key]).toHaveProperty('hoursLogged');
        });
      });
    });
  });

  describe('Numeric ID-based Dynamic Keys Pipeline', () => {
    it('should detect, infer, and generate documents with numeric ID-based dynamic keys', async () => {
      // 1. Load fixture data
      const fixtureData = JSON.parse(
        readFileSync(join(fixturesDir, 'dynamic-keys-numeric.json'), 'utf-8')
      );

      // 2. Normalize documents
      const normalizer = new Normalizer();
      const { documents: normalized, typeHints } = normalizer.normalize(
        fixtureData.map((doc: any) => ({
          ...doc,
          __metadata: { collectionName: 'test', database: 'test' },
        }))
      );

      // 3. Infer schema with dynamic key detection enabled
      // Use lower threshold for test fixtures (8-12 keys)
      const inferencer = new Inferencer({
        dynamicKeyDetection: {
          threshold: 5, // Lower than fixture key count (8-12)
          patterns: [
            { name: 'UUID', regex: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
            { name: 'MONGODB_OBJECTID', regex: '^[0-9a-f]{24}$' },
            { name: 'ULID', regex: '^[0-9A-Z]{26}$' },
            { name: 'NUMERIC_ID', regex: '^\\d{6,20}$' },
            { name: 'PREFIXED_ID', regex: '^(user|doc|item|order)_[a-z0-9]{8,32}$' },
          ],
          minPatternMatch: 0.8,
          confidenceThreshold: 0.7,
          forceStaticPaths: [],
          forceDynamicPaths: [],
        },
      });
      const { schema: inferredSchema, dynamicKeyAnalyses } =
        await inferencer.infer(normalized);

      // Verify dynamic keys were detected in productInventory
      expect(dynamicKeyAnalyses).toBeDefined();
      expect(dynamicKeyAnalyses!.size).toBeGreaterThan(0);

      const productInventoryAnalysis = dynamicKeyAnalyses!.get('productInventory');
      expect(productInventoryAnalysis).toBeDefined();
      expect(productInventoryAnalysis?.isDynamic).toBe(true);
      expect(productInventoryAnalysis?.detection?.pattern).toBe('NUMERIC_ID');

      // 4. Profile constraints
      const profiler = new Profiler();
      const { profile: constraints } = profiler.profile(normalized);

      // 5. Synthesize generation schema
      const synthesizer = new Synthesizer();
      const generationSchema = synthesizer.synthesize(
        inferredSchema,
        constraints,
        typeHints,
        dynamicKeyAnalyses
      );

      // 6. Preprocess schema for generation
      // Need to pass the actual schema object, not the wrapper
      const preprocessedSchema = preprocessSchema(generationSchema.schema);

      // 7. Generate synthetic documents
      initializeFaker(99999);
      const syntheticDocs = [];
      for (let i = 0; i < 5; i++) {
        const doc = await generate(preprocessedSchema);
        syntheticDocs.push(doc);
      }

      // 8. Validate generated documents
      expect(syntheticDocs).toHaveLength(5);

      syntheticDocs.forEach((doc) => {
        expect(doc.productInventory).toBeDefined();
        expect(typeof doc.productInventory).toBe('object');

        const keys = Object.keys(doc.productInventory);

        // Should have realistic number of keys
        expect(keys.length).toBeGreaterThanOrEqual(8);
        expect(keys.length).toBeLessThanOrEqual(12);

        // All keys should be numeric IDs (as strings)
        keys.forEach((key) => {
          expect(key).toMatch(/^\d+$/);
          expect(parseInt(key, 10)).toBeGreaterThan(0);

          // Values should be objects with expected structure
          expect(typeof doc.productInventory[key]).toBe('object');
          expect(doc.productInventory[key]).toHaveProperty('name');
          expect(doc.productInventory[key]).toHaveProperty('quantity');
          expect(doc.productInventory[key]).toHaveProperty('price');
        });
      });
    });
  });

  describe('Variable-Length Arrays Pipeline', () => {
    it('should infer and generate documents with variable-length arrays', async () => {
      // 1. Load fixture data
      const fixtureData = JSON.parse(
        readFileSync(join(fixturesDir, 'variable-length-arrays.json'), 'utf-8')
      );

      // 2. Normalize documents
      const normalizer = new Normalizer();
      const { documents: normalized, typeHints } = normalizer.normalize(
        fixtureData.map((doc: any) => ({
          ...doc,
          __metadata: { collectionName: 'test', database: 'test' },
        }))
      );

      // 3. Infer schema
      const inferencer = new Inferencer();
      const { schema: inferredSchema } = await inferencer.infer(normalized);

      // Verify array fields exist
      expect(inferredSchema.fields).toHaveProperty('tags');
      expect(inferredSchema.fields).toHaveProperty('previousLogins');
      expect(inferredSchema.fields).toHaveProperty('purchaseHistory');

      // 4. Profile constraints
      const profiler = new Profiler();
      const { profile: constraints } = profiler.profile(normalized);

      // Verify array stats exist
      expect(constraints.arrayStats.size).toBeGreaterThan(0);
      expect(constraints.arrayStats.has('tags')).toBe(true);
      expect(constraints.arrayStats.has('previousLogins')).toBe(true);
      expect(constraints.arrayStats.has('purchaseHistory')).toBe(true);

      // Verify distribution is stored as frequency map
      const tagsStats = constraints.arrayStats.get('tags');
      expect(tagsStats).toBeDefined();
      expect(tagsStats?.distribution).toBeDefined();
      expect(typeof tagsStats?.distribution).toBe('object');

      // 5. Synthesize generation schema
      const synthesizer = new Synthesizer();
      const generationSchema = synthesizer.synthesize(
        inferredSchema,
        constraints,
        typeHints
      );

      // 6. Preprocess schema for generation
      // Need to pass the actual schema object, not the wrapper
      const preprocessedSchema = preprocessSchema(generationSchema.schema);

      // 7. Generate synthetic documents
      initializeFaker(77777);
      const syntheticDocs = [];
      for (let i = 0; i < 20; i++) {
        const doc = await generate(preprocessedSchema);
        syntheticDocs.push(doc);
      }

      // 8. Validate generated documents
      expect(syntheticDocs).toHaveLength(20);

      // Collect array length distributions
      const tagsLengths: number[] = [];
      const loginLengths: number[] = [];
      const purchaseLengths: number[] = [];

      syntheticDocs.forEach((doc) => {
        expect(Array.isArray(doc.tags)).toBe(true);
        expect(Array.isArray(doc.previousLogins)).toBe(true);
        expect(Array.isArray(doc.purchaseHistory)).toBe(true);

        tagsLengths.push(doc.tags.length);
        loginLengths.push(doc.previousLogins.length);
        purchaseLengths.push(doc.purchaseHistory.length);
      });

      // Verify realistic length distributions
      expect(Math.min(...tagsLengths)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...tagsLengths)).toBeLessThanOrEqual(10);

      expect(Math.min(...loginLengths)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...loginLengths)).toBeLessThanOrEqual(20);

      expect(Math.min(...purchaseLengths)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...purchaseLengths)).toBeLessThanOrEqual(7);

      // Verify we have some variation (not all the same length)
      const uniqueTagsLengths = new Set(tagsLengths);
      const uniqueLoginLengths = new Set(loginLengths);
      const uniquePurchaseLengths = new Set(purchaseLengths);

      expect(uniqueTagsLengths.size).toBeGreaterThan(1);
      expect(uniqueLoginLengths.size).toBeGreaterThan(1);
      expect(uniquePurchaseLengths.size).toBeGreaterThan(1);
    });
  });
});
