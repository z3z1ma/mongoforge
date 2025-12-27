/**
 * Validate CLI command
 * T084-T086: Implement validate command, NDJSON reader, and JSON report serializer
 */

import { Command } from "commander";
import { createReadStream } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import * as readline from "readline";
import { validateDocumentStream } from "../../lib/validator/index.js";
import {
  GenerationSchema,
  ConstraintsProfile,
  ValidationReport,
} from "../../types/data-model.js";
import { normalizeArrayStats } from "../../lib/profiler/array-stats.js";

import {
  MongoForgeError,
  ErrorCode,
  FileIOError,
} from "../../utils/errors.js";

/**
 * T085: Implement NDJSON input reader as an async generator
 * Yields documents from file or stdin
 */
async function* streamNDJSONDocuments(
  inputPath: string,
): AsyncIterableIterator<any> {
  // Handle stdin vs file
  const input =
    inputPath === "stdin" || inputPath === "-"
      ? process.stdin
      : createReadStream(inputPath, { encoding: "utf8" });

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity, // Handle all line endings
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === "") continue; // Skip empty lines

    try {
      yield JSON.parse(trimmed);
    } catch (err) {
      throw new MongoForgeError(
        ErrorCode.INPUT_READ_ERROR,
        `Failed to parse NDJSON line: ${trimmed.substring(0, 100)}...`,
        undefined,
        { cause: err },
      );
    }
  }
}

/**
 * Load JSON file with proper error handling
 */
async function loadJSONFile<T>(path: string, description: string): Promise<T> {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as T;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in (err as any) &&
      (err as any).code === "ENOENT"
    ) {
      throw new FileIOError(`${description} not found at: ${path}`, undefined, {
        cause: err,
      });
    }
    throw new FileIOError(
      `Failed to load ${description} from ${path}`,
      undefined,
      { cause: err },
    );
  }
}

/**
 * Create wrapped response for CLI output
 */
function createSuccessResponse(report: ValidationReport): any {
  // Determine overall pass/fail
  const schemaPass = report.schemaConformance.conformanceRate === 1.0;
  const arrayPass = Object.values(report.arrayLengthComparison).every(
    (comp) => comp.passed,
  );
  const sizePass = report.documentSizeComparison.buckets.every(
    (bucket) => bucket.passed,
  );
  const idPass = report.keyUniqueness._id.passed;
  const additionalKeysPass = Array.from(
    report.keyUniqueness.additionalKeys.values(),
  ).every((check) => check.passed);

  const overallPassed =
    schemaPass && arrayPass && sizePass && idPass && additionalKeysPass;

  return {
    status: "success",
    phase: "validation",
    report: {
      ...report,
      keyUniqueness: {
        _id: report.keyUniqueness._id,
        additionalKeys: Object.fromEntries(report.keyUniqueness.additionalKeys),
      },
      // Add overall pass/fail flag
      overallPassed,
    },
  };
}

/**
 * T084: Implement validate command
 */
export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate generated documents against schema and constraints")
    .requiredOption(
      "--generation-schema <path>",
      "Path to generation.schema.json",
    )
    .requiredOption("--constraints <path>", "Path to constraints.json")
    .requiredOption(
      "--input-path <path>",
      'Path to NDJSON file to validate (or "stdin")',
    )
    .option(
      "--output-path <path>",
      "Path for validation report JSON (default: stdout)",
    )
    .option(
      "--tolerance-array-len <percent>",
      "Percentage tolerance for array length deviations",
      "10",
    )
    .option(
      "--tolerance-doc-size <percent>",
      "Percentage tolerance for document size deviations",
      "20",
    )
    .action(async (options) => {
      try {
        // Load schema and constraints
        const schema = await loadJSONFile<GenerationSchema>(
          options.generationSchema,
          "Generation schema",
        );
        const constraintsRaw = await loadJSONFile<any>(
          options.constraints,
          "Constraints profile",
        );

        // Convert constraints (handle Map serialization and normalize legacy formats)
        const constraints: ConstraintsProfile = {
          ...constraintsRaw,
          arrayStats: new Map(
            Object.entries(constraintsRaw.arrayStats || {}).map(
              ([path, stats]) => [path, normalizeArrayStats(stats)],
            ),
          ),
        };

        // Parse tolerances
        const arrayLengthTolerance =
          parseFloat(options.toleranceArrayLen) / 100;
        const sizeBucketTolerance = parseFloat(options.toleranceDocSize) / 100;

        // Stream and validate documents
        const documentStream = streamNDJSONDocuments(options.inputPath);
        const report = await validateDocumentStream(
          documentStream,
          schema,
          constraints,
          {
            arrayLengthTolerance,
            sizeBucketTolerance,
          },
        );

        if (report.schemaConformance.totalDocuments === 0) {
          throw new Error("No documents found in input");
        }

        // Create success response
        const response = createSuccessResponse(report);
        const output = JSON.stringify(response, null, 2);

        // Write output
        if (options.outputPath && options.outputPath !== "stdout") {
          const outputDir = dirname(options.outputPath);
          await mkdir(outputDir, { recursive: true });
          await writeFile(options.outputPath, output, "utf8");
          console.log(`Validation report written to: ${options.outputPath}`);
        } else {
          console.log(output);
        }

        // Exit with appropriate code
        const overallPassed = response.report.overallPassed;
        process.exit(overallPassed ? 0 : 1);
      } catch (error) {
        let forgeError: MongoForgeError;

        if (error instanceof MongoForgeError) {
          forgeError = error;
        } else {
          forgeError = new MongoForgeError(
            ErrorCode.GENERAL_ERROR,
            error instanceof Error ? error.message : String(error),
            undefined,
            { cause: error },
          );
        }

        const errorResponse = forgeError.toResponse("validation");
        console.error(JSON.stringify(errorResponse, null, 2));

        // Determine exit code
        let exitCode = 1;
        if (forgeError.code === ErrorCode.FILE_IO_ERROR) exitCode = 4;
        if (forgeError.code === ErrorCode.INPUT_READ_ERROR) exitCode = 4;

        process.exit(exitCode);
      }
    });
}
