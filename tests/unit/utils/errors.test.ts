import { describe, it, expect } from 'vitest';
import {
  MongoForgeError,
  ConfigError,
  ValidationError,
  MongoConnectionError,
  FileIOError,
  ErrorCode
} from '../../../src/utils/errors.js';

describe('Errors', () => {
  it('should create MongoForgeError with correct properties', () => {
    const error = new MongoForgeError(ErrorCode.GENERAL_ERROR, 'test message', { detail: 'extra' });
    expect(error.message).toBe('test message');
    expect(error.code).toBe(ErrorCode.GENERAL_ERROR);
    expect(error.details).toEqual({ detail: 'extra' });
    expect(error.name).toBe('MongoForgeError');
  });

  it('should create ConfigError with correct properties', () => {
    const error = new ConfigError('config error');
    expect(error.message).toBe('config error');
    expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
    expect(error.name).toBe('ConfigError');
  });

  it('should create ValidationError with correct properties', () => {
    const error = new ValidationError('validation error');
    expect(error.message).toBe('validation error');
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.name).toBe('ValidationError');
  });

  it('should create MongoConnectionError with correct properties', () => {
    const error = new MongoConnectionError('connection error');
    expect(error.message).toBe('connection error');
    expect(error.code).toBe(ErrorCode.MONGO_CONNECTION_ERROR);
    expect(error.name).toBe('MongoConnectionError');
  });

  it('should create FileIOError with correct properties', () => {
    const error = new FileIOError('io error');
    expect(error.message).toBe('io error');
    expect(error.code).toBe(ErrorCode.FILE_IO_ERROR);
    expect(error.name).toBe('FileIOError');
  });

  it('should format error for CLI response', () => {
    const error = new MongoForgeError(ErrorCode.GENERAL_ERROR, 'test message', { detail: 'extra' });
    const response = error.toResponse('inference');
    expect(response).toEqual({
      status: 'error',
      phase: 'inference',
      error: {
        code: ErrorCode.GENERAL_ERROR,
        message: 'test message',
        details: { detail: 'extra' }
      }
    });
  });
});
