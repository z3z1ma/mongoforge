/**
 * Structured logging utility
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
}

class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(config: LoggerConfig = { level: "info" }) {
    this.level = config.level;
    this.prefix = config.prefix || "MongoForge";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["error", "warn", "info", "debug"];
    return levels.indexOf(level) <= levels.indexOf(this.level);
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog("error")) {
      console.error(`[${this.prefix}] ERROR:`, message, meta || "");
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog("warn")) {
      console.warn(`[${this.prefix}] WARN:`, message, meta || "");
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog("info")) {
      // Write to stderr to avoid clobbering stdout (used for piped JSON/NDJSON output)
      process.stderr.write(
        `[${this.prefix}] INFO: ${message} ${meta ? JSON.stringify(meta) : ""}\n`,
      );
    }
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog("debug")) {
      // Write to stderr to avoid clobbering stdout (used for piped JSON/NDJSON output)
      process.stderr.write(
        `[${this.prefix}] DEBUG: ${message} ${meta ? JSON.stringify(meta) : ""}\n`,
      );
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Default logger instance
export const logger = new Logger();

// Factory function for custom loggers
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}
