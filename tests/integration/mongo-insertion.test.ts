import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Readable } from 'stream';
import { createMongoInserter } from '../../src/lib/emitter/mongo-inserter.js';

describe.sequential('MongoDB Insertion', () => {
  let mongoServer: MongoMemoryServer;
  let mongoUri: string;
  let client: MongoClient;
  const mongoVersion = process.env.MONGOMS_VERSION ?? '6.0.5';
  process.env.MONGOMS_PLATFORM ??= 'linux';
  process.env.MONGOMS_ARCH ??= 'x64';
  process.env.MONGOMS_DOWNLOAD_URL ??= `https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-${mongoVersion}.tgz`;
  const mongoBinaryOptions = { binary: { version: mongoVersion, platform: 'linux' } };

  const createServerWithRetry = async (attempts = 3, delayMs = 1000): Promise<void> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        mongoServer = await MongoMemoryServer.create(mongoBinaryOptions);
        mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        return;
      } catch (error) {
        lastError = error;

        if (attempt < attempts) {
          console.warn(
            `MongoMemoryServer startup failed (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms...`,
            error
          );
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to start MongoMemoryServer');
  };

  beforeAll(async () => {
    await createServerWithRetry();
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    // Clean up all collections before each test to prevent pollution
    const db = client.db('testdb');
    const collections = await db.collections();
    await Promise.all(collections.map(col => col.drop().catch(() => {})));
  });

  it('should perform bulk insert with default configuration', async () => {
    const testId = `test1-${Date.now()}`;
    const config = {
      uri: mongoUri,
      database: 'testdb',
      collection: `collection-${testId}`,
      batchSize: 100
    };

    const testDocuments: Readable = Readable.from([
      ...Array.from({ length: 500 }, (_, i) => ({
        _id: `${testId}-doc-${i}`,
        name: `Test Document ${i}`,
        value: Math.random()
      }))
    ]);

    const inserter = await createMongoInserter(config);
    const metrics = await inserter.bulkInsert(testDocuments);

    expect(metrics.totalDocuments).toBe(500);
    expect(metrics.insertedDocuments).toBe(500);
    expect(metrics.failedInserts).toBe(0);
    expect(metrics.durationMs).toBeGreaterThan(0);

    // Verify documents were actually inserted
    const collection = client.db(config.database).collection(config.collection);
    const count = await collection.countDocuments();
    expect(count).toBe(500);
  });

  it('should support collection suffix and ordered inserts', async () => {
    const testId = `test2-${Date.now()}`;
    const config = {
      uri: mongoUri,
      database: 'testdb',
      collection: `collection-${testId}`,
      collectionSuffix: '_synthetic',
      batchSize: 100,
      orderedInserts: true
    };

    const testDocuments: Readable = Readable.from([
      ...Array.from({ length: 250 }, (_, i) => ({
        _id: `${testId}-ordered-doc-${i}`,
        index: i
      }))
    ]);

    const inserter = await createMongoInserter(config);
    const metrics = await inserter.bulkInsert(testDocuments);

    expect(metrics.insertedDocuments).toBe(250);

    // Verify documents were inserted in the suffixed collection
    const collection = client.db(config.database).collection(`${config.collection}${config.collectionSuffix}`);
    const documents = await collection.find().toArray();

    expect(documents.length).toBe(250);
    expect(documents[0]._id).toBe(`${testId}-ordered-doc-0`);
  });

  it('should handle partial insertion failures', async () => {
    const testId = `test3-${Date.now()}`;
    const config = {
      uri: mongoUri,
      database: 'testdb',
      collection: `collection-${testId}`,
      orderedInserts: false // Use unordered to continue after errors
    };

    const testDocuments: Readable = Readable.from([
      { _id: `${testId}-doc1`, data: 'first' },
      { _id: `${testId}-doc1`, data: 'duplicate' }, // This will fail (duplicate ID)
      { _id: `${testId}-doc2`, data: 'second' }
    ]);

    const inserter = await createMongoInserter(config);
    const metrics = await inserter.bulkInsert(testDocuments);

    expect(metrics.totalDocuments).toBe(3);
    expect(metrics.insertedDocuments).toBe(2); // doc1 and doc2
    expect(metrics.failedInserts).toBe(1); // duplicate doc1
  });
});
