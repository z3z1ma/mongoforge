import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Readable } from 'stream';
import { createMongoInserter } from '../../src/lib/emitter/mongo-inserter.js';

describe('MongoDB Insertion', () => {
  let mongoServer: MongoMemoryServer;
  let mongoUri: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
  });

  afterAll(async () => {
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should perform bulk insert with default configuration', async () => {
    const config = {
      uri: mongoUri,
      database: 'testdb',
      collection: 'testcollection',
      batchSize: 100
    };

    const testDocuments: Readable = Readable.from([
      ...Array.from({ length: 500 }, (_, i) => ({
        _id: `doc-${i}`,
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

    const client = new MongoClient(mongoUri);
    await client.connect();
    const collection = client.db(config.database).collection(config.collection);
    const count = await collection.countDocuments();
    await client.close();

    expect(count).toBe(500);
  });

  it('should support collection suffix and ordered inserts', async () => {
    const config = {
      uri: mongoUri,
      database: 'testdb',
      collection: 'testcollection',
      collectionSuffix: '_synthetic',
      batchSize: 100,
      orderedInserts: true
    };

    const testDocuments: Readable = Readable.from([
      ...Array.from({ length: 250 }, (_, i) => ({
        _id: `ordered-doc-${i}`,
        index: i
      }))
    ]);

    const inserter = await createMongoInserter(config);
    const metrics = await inserter.bulkInsert(testDocuments);

    expect(metrics.insertedDocuments).toBe(250);

    const client = new MongoClient(mongoUri);
    await client.connect();
    const collection = client.db(config.database).collection(`${config.collection}${config.collectionSuffix}`);
    const documents = await collection.find().toArray();
    await client.close();

    expect(documents.length).toBe(250);
    expect(documents[0]._id).toBe('ordered-doc-0');
  });

  it('should handle partial insertion failures', async () => {
    const config = {
      uri: mongoUri,
      database: 'testdb',
      collection: 'duplicatecollection',
      orderedInserts: false // Use unordered to continue after errors
    };

    const testDocuments: Readable = Readable.from([
      { _id: 'doc1', data: 'first' },
      { _id: 'doc1', data: 'duplicate' }, // This will fail
      { _id: 'doc2', data: 'second' }
    ]);

    const inserter = await createMongoInserter(config);
    const metrics = await inserter.bulkInsert(testDocuments);

    expect(metrics.totalDocuments).toBe(3);
    expect(metrics.insertedDocuments).toBe(2); // doc1 and doc2
    expect(metrics.failedInserts).toBe(1); // duplicate doc1
  });
});
