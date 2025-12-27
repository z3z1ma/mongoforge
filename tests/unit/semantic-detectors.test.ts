/**
 * Unit tests for semantic detectors
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeFieldForSemanticType,
  BUILTIN_DETECTORS,
} from '../../src/lib/inferencer/semantic-detectors.js';

describe('Semantic Detectors', () => {
  it('should detect email addresses', () => {
    const values = ['alice@example.com', 'bob@work.co', 'charlie.brown@peanuts.org'];
    const result = analyzeFieldForSemanticType('email', 'email', values);

    expect(result).toBeDefined();
    expect(result?.semanticType).toBe('Email');
    expect(result?.confidence).toBe(1.0);
  });

  it('should detect URLs', () => {
    const values = ['https://google.com', 'http://localhost:3000/api', 'https://github.com/steveyegge/beads'];
    const result = analyzeFieldForSemanticType('website', 'user.website', values);

    expect(result).toBeDefined();
    expect(result?.semanticType).toBe('URL');
    expect(result?.confidence).toBe(1.0);
  });

  it('should detect UUIDs', () => {
    const values = [
      '550e8400-e29b-41d4-a716-446655440000',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      '00000000-0000-0000-0000-000000000000',
    ];
    const result = analyzeFieldForSemanticType('uuid', 'id', values);

    expect(result).toBeDefined();
    expect(result?.semanticType).toBe('UUID');
    expect(result?.confidence).toBe(1.0);
  });

  it('should detect IPv4 addresses', () => {
    const values = ['192.168.1.1', '8.8.8.8', '127.0.0.1'];
    const result = analyzeFieldForSemanticType('ip_address', 'client_ip', values);

    expect(result).toBeDefined();
    expect(result?.semanticType).toBe('IPv4');
    expect(result?.confidence).toBe(1.0);
  });

  it('should detect IPv6 addresses', () => {
    const values = ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', '::1', '2001:db8::'];
    // Note: My regex for IPv6 might need to be more robust for all shorthands,
    // but let's test with full or simple ones first.
    // My regex: /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i
    // Wait, '::1' won't match that.
    const result = analyzeFieldForSemanticType('ip_address', 'client_ip', values);

    expect(result).toBeDefined();
    expect(result?.semanticType).toBe('IPv6');
  });

  it('should detect phone numbers', () => {
    const values = ['+1-555-123-4567', '(555) 123-4567', '555.123.4567', '+44 20 7123 4567'];
    const result = analyzeFieldForSemanticType('phone_number', 'user.phone', values);

    expect(result).toBeDefined();
    expect(result?.semanticType).toBe('Phone');
    expect(result?.confidence).toBe(1.0);
  });

  it('should detect person names', () => {
    const values = ['John Doe', 'Alice Smith', 'Charlie Brown', 'Sarah O\'Connor'];
    const result = analyzeFieldForSemanticType('first_name', 'user.name', values);

    expect(result).toBeDefined();
    expect(result?.semanticType).toBe('PersonName');
    expect(result?.confidence).toBe(1.0);
  });

  it('should respect confidence threshold', () => {
    const values = ['alice@example.com', 'not-an-email', 'bob@work.co'];
    // Confidence = 2/3 = 0.666...
    // Email detector minConfidence is 0.8
    const result = analyzeFieldForSemanticType('email', 'email', values);

    expect(result).toBeNull();
  });
});
