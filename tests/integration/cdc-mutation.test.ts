import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Readable } from 'stream';
import { createMongoInserter } from '../../src/lib/emitter/mongo-inserter.js';
import { MutationGenerator } from '../../src/lib/generator/mutation-engine.js';
import { DocumentIDCache } from '../../src/lib/utils/id-cache.js';
import { createCDCStream } from '../../src/lib/generator/cdc-stream.js';
import { MutationConfig, CDCOperation } from '../../src/types/cdc.js';
import { GenerationSchema } from '../../src/types/data-model.js';

describe('CDC Mutation Integration', () => {
  let mongoServer: MongoMemoryServer;
  let mongoUri: string;
  let client: MongoClient;

  const testSchema: GenerationSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', faker: 'person.fullName' },
      email: { type: 'string', faker: 'internet.email' },
      age: { type: 'integer', minimum: 18, maximum: 80 }
    }
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    client = new MongoClient(mongoUri);
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    const db = client.db('testdb');
    const collections = await db.collections();
    await Promise.all(collections.map(col => col.drop().catch(() => {})));
  });

  it('should perform bulkWrite with mixed update and delete operations', async () => {
    const database = 'testdb';
    const collectionName = 'users';
    const db = client.db(database);
    const collection = db.collection(collectionName);

    // 1. Seed initial data
    const initialDocs = Array.from({ length: 100 }, (_, i) => ({
      _id: `user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + i
    }));
    await collection.insertMany(initialDocs);

    // 2. Setup MutationGenerator
    const config: MutationConfig = {
      targetUri: mongoUri,
      database,
      collection: collectionName,
      ratios: { insert: 0, update: 70, delete: 30 },
      batchSize: 50,
      updateStrategy: 'partial',
      deleteBehavior: 'remove',
      idCacheSize: 1000
    };
    const generator = new MutationGenerator(config, testSchema);

    // 3. Create operation stream
    const ops: CDCOperation[] = [];
    for (let i = 0; i < 50; i++) {
      const type = i % 2 === 0 ? 'update' : 'delete';
      const id = `user-${i}`;
      ops.push(await generator.generateMutation(id, type as any));
    }
    const opStream = Readable.from(ops);

    // 4. Execute bulkWrite
    const inserter = await createMongoInserter({
      uri: mongoUri,
      database,
      collection: collectionName
    });
    const metrics = await inserter.bulkWrite(opStream);

    expect(metrics.totalDocuments).toBe(50);
    expect(metrics.updatedDocuments).toBe(25);
    expect(metrics.deletedDocuments).toBe(25);

    // 5. Verify DB state
    const remainingCount = await collection.countDocuments();
    expect(remainingCount).toBe(75); // 100 - 25 deletes

    const updatedDoc = await collection.findOne({ _id: 'user-0' });
    expect(updatedDoc).toBeDefined();
    // Since it was a partial update, some fields should still be there, 
    // and at least one field from the schema might have been updated.
  });

  it('should handle regenerate strategy', async () => {
    const database = 'testdb';
    const collectionName = 'users_regen';
    const db = client.db(database);
    const collection = db.collection(collectionName);

    await collection.insertOne({ _id: 'user-regen', name: 'Old Name', email: 'old@example.com' });

    const config: MutationConfig = {
      targetUri: mongoUri,
      database,
      collection: collectionName,
      ratios: { insert: 0, update: 100, delete: 0 },
      batchSize: 10,
      updateStrategy: 'regenerate',
      deleteBehavior: 'remove',
      idCacheSize: 100
    };
    const generator = new MutationGenerator(config, testSchema);
    
    const op = await generator.generateMutation('user-regen', 'update');
    const opStream = Readable.from([op]);

    const inserter = await createMongoInserter({
      uri: mongoUri,
      database,
      collection: collectionName
    });
    await inserter.bulkWrite(opStream);

    const doc = await collection.findOne({ _id: 'user-regen' });
    expect(doc).toBeDefined();
    expect(doc!.name).not.toBe('Old Name');
    expect(doc!.email).not.toBe('old@example.com');
  });

  it('should generate mixed traffic in CDC simulation mode', async () => {
    const database = 'testdb';
    const collectionName = 'cdc_sim';
    const db = client.db(database);
    const collection = db.collection(collectionName);

    const cache = new DocumentIDCache(100);
    // Seed cache
    for (let i = 0; i < 50; i++) {
      cache.add(`seed-${i}`);
      await collection.insertOne({ _id: `seed-${i}`, name: `Seed ${i}` });
    }

    const config: MutationConfig = {
      targetUri: mongoUri,
      database,
      collection: collectionName,
      ratios: { insert: 40, update: 40, delete: 20 },
      batchSize: 10,
      updateStrategy: 'partial',
      deleteBehavior: 'remove',
      idCacheSize: 100
    };

    const cdcStream = createCDCStream(testSchema, config, cache, 100);
    const inserter = await createMongoInserter({
      uri: mongoUri,
      database,
      collection: collectionName
    });

    const metrics = await inserter.bulkWrite(cdcStream);

    expect(metrics.totalDocuments).toBe(100);
    expect(metrics.insertedDocuments).toBeGreaterThan(0);
    expect(metrics.updatedDocuments).toBeGreaterThan(0);
    expect(metrics.deletedDocuments).toBeGreaterThan(0);

    const finalCount = await collection.countDocuments();
    expect(finalCount).toBe(50 + metrics.insertedDocuments - metrics.deletedDocuments);
  });
});
