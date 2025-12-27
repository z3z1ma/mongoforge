/**
 * Unit tests for synthesizer semantic type mapping
 */

import { describe, it, expect } from 'vitest';
import { synthesize } from '../../src/lib/synthesizer/index.js';
import {
  InferredSchema,
  ConstraintsProfile,
  TypeHint,
} from '../../src/types/data-model.js';

describe('Synthesizer Semantic Mapping', () => {
  it('should map IPv4 semantic type to ipv4 format', () => {
    const inferredSchema: InferredSchema = {
      count: 10,
      fields: {
        client_ip: {
          name: 'client_ip',
          path: 'client_ip',
          count: 10,
          probability: 1.0,
          type: 'String',
          types: [
            {
              name: 'String',
              count: 10,
              probability: 1.0,
              values: ['192.168.1.1'],
              semanticType: 'IPv4',
              semanticConfidence: 1.0,
            },
          ],
        },
      },
    } as any;

    const constraints: ConstraintsProfile = {
      arrayStats: new Map(),
      numericRanges: new Map(),
      sizeBuckets: [],
      keyFields: { additionalKeys: [] },
      config: { arrayLenPolicy: 'minmax' },
    } as any;

    const schema = synthesize(inferredSchema, constraints, new Map());

    expect(schema.properties.client_ip.format).toBe('ipv4');
  });

  it('should map IPv6 semantic type to ipv6 format', () => {
    const inferredSchema: InferredSchema = {
      count: 10,
      fields: {
        client_ip: {
          name: 'client_ip',
          path: 'client_ip',
          count: 10,
          probability: 1.0,
          type: 'String',
          types: [
            {
              name: 'String',
              count: 10,
              probability: 1.0,
              values: ['2001:db8::1'],
              semanticType: 'IPv6',
              semanticConfidence: 1.0,
            },
          ],
        },
      },
    } as any;

    const constraints: ConstraintsProfile = {
      arrayStats: new Map(),
      numericRanges: new Map(),
      sizeBuckets: [],
      keyFields: { additionalKeys: [] },
      config: { arrayLenPolicy: 'minmax' },
    } as any;

    const schema = synthesize(inferredSchema, constraints, new Map());

    expect(schema.properties.client_ip.format).toBe('ipv6');
  });

  it('should map Email semantic type to email format', () => {
    const inferredSchema: InferredSchema = {
      count: 10,
      fields: {
        user_email: {
          name: 'user_email',
          path: 'user_email',
          count: 10,
          probability: 1.0,
          type: 'String',
          types: [
            {
              name: 'String',
              count: 10,
              probability: 1.0,
              values: ['test@example.com'],
              semanticType: 'Email',
              semanticConfidence: 1.0,
            },
          ],
        },
      },
    } as any;

    const constraints: ConstraintsProfile = {
      arrayStats: new Map(),
      numericRanges: new Map(),
      sizeBuckets: [],
      keyFields: { additionalKeys: [] },
      config: { arrayLenPolicy: 'minmax' },
    } as any;

    const schema = synthesize(inferredSchema, constraints, new Map());

    expect(schema.properties.user_email.format).toBe('email');
  });

  it('should map UUID semantic type to uuid format', () => {
    const inferredSchema: InferredSchema = {
      count: 10,
      fields: {
        request_id: {
          name: 'request_id',
          path: 'request_id',
          count: 10,
          probability: 1.0,
          type: 'String',
          types: [
            {
              name: 'String',
              count: 10,
              probability: 1.0,
              values: ['550e8400-e29b-41d4-a716-446655440000'],
              semanticType: 'UUID',
              semanticConfidence: 1.0,
            },
          ],
        },
      },
    } as any;

    const constraints: ConstraintsProfile = {
      arrayStats: new Map(),
      numericRanges: new Map(),
      sizeBuckets: [],
      keyFields: { additionalKeys: [] },
      config: { arrayLenPolicy: 'minmax' },
    } as any;

    const schema = synthesize(inferredSchema, constraints, new Map());

    expect(schema.properties.request_id.format).toBe('uuid');
  });
});

describe('Synthesizer Required Fields', () => {
  const inferredSchema: InferredSchema = {
    count: 100,
    fields: {
      _id: { name: '_id', path: '_id', count: 100, probability: 1.0, type: 'String', types: [{name: 'String', probability: 1.0}] },
      highly_probable: { name: 'highly_probable', path: 'highly_probable', count: 90, probability: 0.9, type: 'String', types: [{name: 'String', probability: 1.0}] },
      less_probable: { name: 'less_probable', path: 'less_probable', count: 50, probability: 0.5, type: 'String', types: [{name: 'String', probability: 1.0}] },
    },
  } as any;

  const constraints: ConstraintsProfile = {
    arrayStats: new Map(),
    numericRanges: new Map(),
    sizeBuckets: [],
    keyFields: { additionalKeys: [] },
    config: { arrayLenPolicy: 'minmax' },
  } as any;

  it('should use default threshold (0.95)', () => {
    const schema = synthesize(inferredSchema, constraints, new Map());
    expect(schema.required).toContain('_id');
    expect(schema.required).not.toContain('highly_probable');
    expect(schema.required).not.toContain('less_probable');
  });

  it('should use configurable threshold (0.85)', () => {
    const schema = synthesize(inferredSchema, constraints, new Map(), { requiredThreshold: 0.85 });
    expect(schema.required).toContain('_id');
    expect(schema.required).toContain('highly_probable');
    expect(schema.required).not.toContain('less_probable');
  });

  it('should use configurable threshold (0.45)', () => {
    const schema = synthesize(inferredSchema, constraints, new Map(), { requiredThreshold: 0.45 });
    expect(schema.required).toContain('_id');
    expect(schema.required).toContain('highly_probable');
    expect(schema.required).toContain('less_probable');
  });

  it('should honor enforceRequired: false', () => {
    const schema = synthesize(inferredSchema, constraints, new Map(), { enforceRequired: false, requiredThreshold: 0.1 });
    expect(schema.required).toContain('_id');
    expect(schema.required).not.toContain('highly_probable');
    expect(schema.required).not.toContain('less_probable');
  });
});
