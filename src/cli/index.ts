#!/usr/bin/env node

/**
 * MongoForge CLI - Schema-driven synthetic MongoDB document generation
 */

import { Command } from 'commander';
import { createInferCommand } from './commands/infer.js';
import { logger } from '../utils/logger.js';

// Read package.json for version
const pkg = {
  name: 'mongoforge',
  version: '0.1.0',
  description: 'Schema-driven synthetic MongoDB document generation for high-volume CDC and load testing',
};

/**
 * Main CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name(pkg.name)
    .description(pkg.description)
    .version(pkg.version)
    .option('--log-level <level>', 'Logging verbosity: error, warn, info, debug', 'info');

  // Add commands
  program.addCommand(createInferCommand());

  // TODO: Add generate command (Phase 6)
  // program.addCommand(createGenerateCommand());

  // TODO: Add validate command (Phase 7)
  // program.addCommand(createValidateCommand());

  return program;
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const program = createProgram();

  // Set log level from global options
  const opts = program.opts();
  if (opts.logLevel) {
    process.env.LOG_LEVEL = opts.logLevel;
  }

  // Parse arguments
  await program.parseAsync(process.argv);
}

// Run CLI
main().catch((error) => {
  logger.error('Unexpected error', { error: error.message });
  console.error(JSON.stringify({
    status: 'error',
    error: {
      code: 'UNEXPECTED_ERROR',
      message: error.message,
    },
  }, null, 2));
  process.exit(1);
});
