import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadGenerationSchema, saveGenerationSchema } from '../../../src/lib/generator/schema-loader.js';
import fs from 'node:fs/promises';

vi.mock('node:fs/promises');
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }
}));

describe('schema-loader', () => {
  const mockPath = '/tmp/test-schema.json';
  const mockSchema = { type: 'object', properties: { foo: { type: 'string' } } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadGenerationSchema', () => {
    it('should load and parse a JSON schema', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSchema));

      const result = await loadGenerationSchema(mockPath);

      expect(fs.readFile).toHaveBeenCalledWith(mockPath, 'utf-8');
      expect(result).toEqual(mockSchema);
    });

    it('should throw Error if file reading fails', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read failed'));

      await expect(loadGenerationSchema(mockPath)).rejects.toThrow(/Failed to load schema from/);
    });

    it('should throw Error if JSON parsing fails', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(loadGenerationSchema(mockPath)).rejects.toThrow(/Failed to load schema from/);
    });
  });

  describe('saveGenerationSchema', () => {
    it('should stringify and save a JSON schema', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await saveGenerationSchema(mockSchema as any, mockPath);

      expect(fs.writeFile).toHaveBeenCalledWith(mockPath, JSON.stringify(mockSchema, null, 2), 'utf-8');
    });

    it('should throw Error if file writing fails', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));

      await expect(saveGenerationSchema(mockSchema as any, mockPath)).rejects.toThrow(/Failed to save schema to/);
    });
  });
});
