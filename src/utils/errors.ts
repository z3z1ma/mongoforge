/**
 * Standard error classes for MongoForge
 */

export enum ErrorCode {
  GENERAL_ERROR = "GENERAL_ERROR",
  MONGO_CONNECTION_ERROR = "MONGO_CONNECTION_ERROR",
  FILE_IO_ERROR = "FILE_IO_ERROR",
  CONFIG_ERROR = "CONFIG_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INFERENCE_ERROR = "INFERENCE_ERROR",
  SYNTHESIS_ERROR = "SYNTHESIS_ERROR",
  SAMPLING_ERROR = "SAMPLING_ERROR",
  INPUT_READ_ERROR = "INPUT_READ_ERROR",
}

export class MongoForgeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: any,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MongoForgeError";
  }

  /**
   * Convert error to a format suitable for CLI output
   */
  toResponse(phase: string) {
    return {
      status: "error",
      phase,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
        ...(this.cause ? { cause: String(this.cause) } : {}),
      },
    };
  }
}

export class MongoConnectionError extends MongoForgeError {
  constructor(message: string, details?: any, options?: ErrorOptions) {
    super(ErrorCode.MONGO_CONNECTION_ERROR, message, details, options);
    this.name = "MongoConnectionError";
  }
}

export class ConfigError extends MongoForgeError {
  constructor(message: string, details?: any, options?: ErrorOptions) {
    super(ErrorCode.CONFIG_ERROR, message, details, options);
    this.name = "ConfigError";
  }
}

export class FileIOError extends MongoForgeError {
  constructor(message: string, details?: any, options?: ErrorOptions) {
    super(ErrorCode.FILE_IO_ERROR, message, details, options);
    this.name = "FileIOError";
  }
}

export class ValidationError extends MongoForgeError {
  constructor(message: string, details?: any, options?: ErrorOptions) {
    super(ErrorCode.VALIDATION_ERROR, message, details, options);
    this.name = "ValidationError";
  }
}
