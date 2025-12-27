/**
 * Validate CLI command
 * T084-T086: Implement validate command, NDJSON reader, and JSON report serializer
 */

import { Command } from 'commander';
import { createReadStream } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import * as readline from 'readline';
import { validateDocuments } from '../../lib/validator/index.js';
import { GenerationSchema, ConstraintsProfile, ValidationReport } from '../../types/data-model.js';
import { normalizeArrayStats } from '../../lib/profiler/array-stats.js';

/**
 * T085: Implement NDJSON input reader
 * Reads NDJSON documents from file or stdin
 */
async function readNDJSONDocuments(inputPath: string): Promise<any[]> {
  const documents: any[] = [];

  // Handle stdin vs file
  const input =
    inputPath === 'stdin' || inputPath === '-'
      ? process.stdin
      : createReadStream(inputPath, { encoding: 'utf8' });

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity, // Handle all line endings
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === '') continue; // Skip empty lines

    try {
      const doc = JSON.parse(trimmed);
      documents.push(doc);
    } catch (err) {
      throw new Error(`Failed to parse NDJSON line: ${trimmed.substring(0, 100)}... - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return documents;
}

/**
 * Load JSON file with proper error handling
 */
async function loadJSONFile<T>(path: string, description: string): Promise<T> {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content) as T;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      throw new Error(`${description} not found at: ${path}`);
    }
    throw new Error(`Failed to load ${description} from ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * T086: Implement validation report serializer (JSON output)
 * Serializes ValidationReport to JSON, handling Map objects
 */
function serializeValidationReport(report: ValidationReport): string {
  // Convert Map to plain object for JSON serialization
  const serializable = {
    ...report,
    keyUniqueness: {
      _id: report.keyUniqueness._id,
      additionalKeys: Object.fromEntries(report.keyUniqueness.additionalKeys),
    },
  };

  return JSON.stringify(serializable, null, 2);
}

/**
 * Create wrapped response for CLI output
 */
function createSuccessResponse(report: ValidationReport): any {
  // Determine overall pass/fail
  const schemaPass = report.schemaConformance.conformanceRate === 1.0;
  const arrayPass = Object.values(report.arrayLengthComparison).every((comp) => comp.passed);
  const sizePass = report.documentSizeComparison.buckets.every((bucket) => bucket.passed);
  const idPass = report.keyUniqueness._id.passed;
  const additionalKeysPass = Array.from(report.keyUniqueness.additionalKeys.values()).every((check) => check.passed);

  const overallPassed = schemaPass && arrayPass && sizePass && idPass && additionalKeysPass;

  return {
    status: 'success',
    phase: 'validation',
    report: {
      ...report,
      // Add overall pass/fail flag
      overallPassed,
    },
  };
}

/**
 * Create error response for CLI output
 */
function createErrorResponse(code: string, message: string, details?: string): any {
  return {
    status: 'error',
    phase: 'validation',
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

/**
 * T084: Implement validate command
 */
export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate generated documents against schema and constraints')
    .requiredOption('--generation-schema <path>', 'Path to generation.schema.json')
    .requiredOption('--constraints <path>', 'Path to constraints.json')
    .requiredOption('--input-path <path>', 'Path to NDJSON file to validate (or "stdin")')
    .option('--output-path <path>', 'Path for validation report JSON (default: stdout)')
    .option('--tolerance-array-len <percent>', 'Percentage tolerance for array length deviations', '10')
    .option('--tolerance-doc-size <percent>', 'Percentage tolerance for document size deviations', '20')
    .action(async (options) => {
      try {
        // Load schema and constraints
        const schema = await loadJSONFile<GenerationSchema>(options.generationSchema, 'Generation schema');
        const constraintsRaw = await loadJSONFile<any>(options.constraints, 'Constraints profile');

        // Convert constraints (handle Map serialization and normalize legacy formats)
        const constraints: ConstraintsProfile = {
          ...constraintsRaw,
          arrayStats: new Map(
            Object.entries(constraintsRaw.arrayStats || {}).map(([path, stats]) => [
              path,
              normalizeArrayStats(stats),
            ])
          ),
        };

        // Read input documents
        const documents = await readNDJSONDocuments(options.inputPath);

        if (documents.length === 0) {
          throw new Error('No documents found in input');
        }

        // Parse tolerances
        const arrayLengthTolerance = parseFloat(options.toleranceArrayLen) / 100;
        const sizeBucketTolerance = parseFloat(options.toleranceDocSize) / 100;

        // Validate documents
        const report = validateDocuments(documents, schema, constraints, {
          arrayLengthTolerance,
          sizeBucketTolerance,
        });

        // Create success response
        const response = createSuccessResponse(report);
        const output = JSON.stringify(response, null, 2);

        // Write output
        if (options.outputPath && options.outputPath !== 'stdout') {
          await writeFile(options.outputPath, output, 'utf8');
          console.log(`Validation report written to: ${options.outputPath}`);
        } else {
          console.log(output);
        }

        // Exit with appropriate code
        const overallPassed = response.report.overallPassed;
        process.exit(overallPassed ? 0 : 1);
      } catch (error) {
        const err = error as Error;

        // Determine error code
        let errorCode = 'GENERAL_ERROR';
        let exitCode = 1;

        if (err.message.includes('not found')) {
          errorCode = 'FILE_IO_ERROR';
          exitCode = 4;
        } else if (err.message.includes('Failed to load')) {
          errorCode = 'SCHEMA_LOAD_ERROR';
          exitCode = 4;
        } else if (err.message.includes('Failed to parse')) {
          errorCode = 'INPUT_READ_ERROR';
          exitCode = 4;
        }

        const errorResponse = createErrorResponse(errorCode, err.message);
        console.error(JSON.stringify(errorResponse, null, 2));
        process.exit(exitCode);
      }
    });
}
