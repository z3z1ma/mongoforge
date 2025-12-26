/**
 * Unit tests for schema validator
 */

import { describe, it, expect } from 'vitest';
import { SchemaValidator, checkIdUniqueness, checkKeyFieldUniqueness } from '../../../src/lib/validator/schema-validator.js';
import { GenerationSchema } from '../../../src/types/data-model.js';

describe('SchemaValidator', () => {
  const testSchema: GenerationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'TestDoc',
    properties: {
      _id: { type: 'string' },
      name: { type: 'string' },
      age: { type: 'number' },
    },
    required: ['_id', 'name'],
    additionalProperties: true,
  };

  describe('compile()', () => {
    it('should compile a valid schema', () => {
      const validator = new SchemaValidator();
      expect(() => validator.compile(testSchema)).not.toThrow();
    });
  });

  describe('validate()', () => {
    it('should validate a conforming document', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      const validDoc = { _id: '123', name: 'Test', age: 30 };
      expect(validator.validate(validDoc)).toBe(true);
    });

    it('should reject a non-conforming document', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      const invalidDoc = { _id: '123', age: 'thirty' }; // Missing name, wrong type for age
      expect(validator.validate(invalidDoc)).toBe(false);
    });

    it('should throw if schema not compiled', () => {
      const validator = new SchemaValidator();
      expect(() => validator.validate({})).toThrow('Schema not compiled');
    });
  });

  describe('getErrors()', () => {
    it('should return errors for invalid documents', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      validator.validate({ _id: '123' }); // Missing name
      const errors = validator.getErrors();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.path).toContain('name');
    });

    it('should return empty array for valid documents', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      validator.validate({ _id: '123', name: 'Test' });
      expect(validator.getErrors()).toHaveLength(0);
    });
  });

  describe('validateAll()', () => {
    it('should validate multiple documents', () => {
      const validator = new SchemaValidator();
      validator.compile(testSchema);

      const docs = [
        { _id: '1', name: 'Valid1' },
        { _id: '2', name: 'Valid2' },
        { _id: '3' }, // Invalid - missing name
      ];

      const result = validator.validateAll(docs);

      expect(result.totalDocuments).toBe(3);
      expect(result.validDocuments).toBe(2);
      expect(result.invalidDocuments).toBe(1);
      expect(result.conformanceRate).toBeCloseTo(0.667, 2);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.documentIndex).toBe(2);
    });
  });
});

describe('checkIdUniqueness()', () => {
  it('should pass for unique _id values', () => {
    const docs = [{ _id: '1' }, { _id: '2' }, { _id: '3' }];
    const result = checkIdUniqueness(docs);

    expect(result.totalKeys).toBe(3);
    expect(result.uniqueKeys).toBe(3);
    expect(result.duplicates).toBe(0);
    expect(result.passed).toBe(true);
  });

  it('should fail for duplicate _id values', () => {
    const docs = [{ _id: '1' }, { _id: '2' }, { _id: '1' }]; // Duplicate
    const result = checkIdUniqueness(docs);

    expect(result.totalKeys).toBe(3);
    expect(result.uniqueKeys).toBe(2);
    expect(result.duplicates).toBe(1);
    expect(result.passed).toBe(false);
  });

  it('should handle ObjectId-like strings', () => {
    const docs = [{ _id: '507f1f77bcf86cd799439011' }, { _id: '507f1f77bcf86cd799439012' }];
    const result = checkIdUniqueness(docs);

    expect(result.passed).toBe(true);
  });
});

describe('checkKeyFieldUniqueness()', () => {
  it('should check uniqueness for single field', () => {
    const docs = [{ email: 'a@test.com' }, { email: 'b@test.com' }, { email: 'c@test.com' }];
    const result = checkKeyFieldUniqueness(docs, ['email']);

    const emailCheck = result.get('email');
    expect(emailCheck?.totalKeys).toBe(3);
    expect(emailCheck?.uniqueKeys).toBe(3);
    expect(emailCheck?.passed).toBe(true);
  });

  it('should check uniqueness for nested fields', () => {
    const docs = [{ user: { id: 'u1' } }, { user: { id: 'u2' } }, { user: { id: 'u1' } }]; // Duplicate
    const result = checkKeyFieldUniqueness(docs, ['user.id']);

    const userIdCheck = result.get('user.id');
    expect(userIdCheck?.totalKeys).toBe(3);
    expect(userIdCheck?.uniqueKeys).toBe(2);
    expect(userIdCheck?.duplicates).toBe(1);
    expect(userIdCheck?.passed).toBe(false);
  });

  it('should check multiple fields simultaneously', () => {
    const docs = [
      { email: 'a@test.com', accountId: 'ACC001' },
      { email: 'b@test.com', accountId: 'ACC002' },
      { email: 'c@test.com', accountId: 'ACC003' },
    ];

    const result = checkKeyFieldUniqueness(docs, ['email', 'accountId']);

    expect(result.size).toBe(2);
    expect(result.get('email')?.passed).toBe(true);
    expect(result.get('accountId')?.passed).toBe(true);
  });
});
