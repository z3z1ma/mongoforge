/**
 * Infer command - discover schema from MongoDB collection
 */

import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { InferCommandOptions, InferConfig } from '../config/types.js';
import { parseConfigFile, validateConfigSection } from '../config/parser.js';
import { Sampler } from '../../lib/sampler/index.js';
import { Normalizer } from '../../lib/normalizer/index.js';
import { Inferencer } from '../../lib/inferencer/index.js';
import { Profiler } from '../../lib/profiler/index.js';
import { Synthesizer } from '../../lib/synthesizer/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Merge CLI options with config file
 */
function mergeInferConfig(
  options: InferCommandOptions,
  configFile?: InferConfig
): InferConfig {
  // Parse comma-separated values
  const percentiles = options.percentiles
    ? options.percentiles.split(',').map((p) => parseInt(p.trim(), 10))
    : undefined;

  const clampRange = options.clampRange
    ? (options.clampRange.split(',').map((p) => parseInt(p.trim(), 10)) as [number, number])
    : undefined;

  const keyFields = options.keyFields ? options.keyFields.split(',').map((k) => k.trim()) : undefined;

  // Build config from CLI options
  const cliConfig: Partial<InferConfig> = {
    source: options.sourceUri
      ? {
          uri: options.sourceUri,
          database: options.sourceDb!,
          collection: options.sourceCollection!,
        }
      : undefined,
    sampling: options.sampleSize
      ? {
          sampleSize: options.sampleSize,
          strategy: options.samplingStrategy || 'random',
          timeField: options.timeField,
        }
      : undefined,
    constraints: options.arrayLenPolicy
      ? {
          arrayLenPolicy: options.arrayLenPolicy,
          percentiles: percentiles || [50, 90, 99],
          clampRange: clampRange || [1, 99],
          sizeProxy: 'leafFieldCount',
        }
      : undefined,
    keys: options.idPolicy
      ? {
          idPolicy: options.idPolicy,
          keyFields: keyFields || [],
          enforceUniqueKeys: options.enforceUniqueKeys ?? false,
          uniquenessScope: options.uniquenessScope || 'run',
        }
      : undefined,
    output: options.outputDir
      ? {
          dir: options.outputDir,
        }
      : undefined,
  };

  // Merge with config file (CLI options take precedence)
  const merged: InferConfig = {
    source: { ...configFile?.source, ...cliConfig.source } as any,
    sampling: { ...configFile?.sampling, ...cliConfig.sampling } as any,
    constraints: { ...configFile?.constraints, ...cliConfig.constraints } as any,
    keys: { ...configFile?.keys, ...cliConfig.keys } as any,
    output: { ...configFile?.output, ...cliConfig.output } as any,
  };

  return merged;
}

/**
 * Validate infer configuration
 */
function validateInferConfig(config: InferConfig): void {
  // Validate source
  if (!config.source?.uri || !config.source?.database || !config.source?.collection) {
    throw new Error(
      'Missing required source configuration: --source-uri, --source-db, --source-collection'
    );
  }

  // Validate sampling
  if (!config.sampling?.sampleSize) {
    throw new Error('Missing required sampling configuration: --sample-size');
  }

  if (config.sampling.strategy === 'time-windowed' && !config.sampling.timeField) {
    throw new Error('--time-field is required when using time-windowed sampling strategy');
  }

  // Set defaults if missing
  config.output = config.output || { dir: './output' };
  config.constraints = config.constraints || {
    arrayLenPolicy: 'percentileClamp',
    percentiles: [50, 90, 99],
    clampRange: [1, 99],
    sizeProxy: 'leafFieldCount',
  };
  config.keys = config.keys || {
    idPolicy: 'inferred',
    keyFields: [],
    enforceUniqueKeys: false,
    uniquenessScope: 'run',
  };
}

/**
 * Execute infer command
 */
async function executeInfer(options: InferCommandOptions): Promise<void> {
  const startTime = Date.now();

  try {
    // Set log level if provided
    if (options.logLevel) {
      logger.setLevel(options.logLevel as any);
    }

    // Parse config file if provided
    let configFile: InferConfig | undefined;
    if (options.config) {
      const fullConfig = parseConfigFile(options.config);
      configFile = fullConfig.infer as InferConfig;
    }

    // Merge configurations
    const config = mergeInferConfig(options, configFile);
    validateInferConfig(config);

    logger.info('Starting discovery phase', { config });

    // Create output directory
    mkdirSync(config.output.dir, { recursive: true });

    // Step 1: Sample documents from MongoDB
    logger.info('Sampling documents from MongoDB');

    // Map CLI strategy to sampler strategy
    const samplingStrategy =
      config.sampling.strategy === 'first-n' ? 'firstN' as const :
      config.sampling.strategy === 'time-windowed' ? 'timeWindowed' as const :
      'random' as const;

    const samplerOptions = {
      uri: config.source.uri,
      database: config.source.database,
      collection: config.source.collection,
      sampleSize: config.sampling.sampleSize,
      strategy: samplingStrategy,
      timeWindow: config.sampling.timeField ? {
        field: config.sampling.timeField,
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
        end: new Date(),
      } : undefined,
    };

    const sampler = new Sampler(samplerOptions);
    const samplerResult = await sampler.sample(samplerOptions);

    const samples = samplerResult.documents;
    logger.info('Sampling complete', { count: samples.length });

    // Step 2: Normalize documents
    logger.info('Normalizing documents');
    const normalizer = new Normalizer();
    const { documents: normalized, typeHints } = normalizer.normalize(samples);

    logger.info('Normalization complete', {
      count: normalized.length,
      uniqueTypeHints: typeHints.size,
    });

    // Step 3: Infer schema
    logger.info('Inferring schema');
    const inferencer = new Inferencer({
      semanticTypes: false,
      storeValues: false,
    });
    const { schema: inferredSchema, metadata: inferMeta } = await inferencer.infer(normalized);

    logger.info('Schema inference complete', inferMeta);

    // Write inferred schema
    const inferredSchemaPath = resolve(config.output.dir, 'inferred.schema.json');
    writeFileSync(inferredSchemaPath, JSON.stringify(inferredSchema, null, 2), 'utf-8');

    // Step 4: Profile constraints
    logger.info('Profiling constraints');
    const profiler = new Profiler({
      arrayLenPolicy: config.constraints.arrayLenPolicy,
      percentiles: config.constraints.percentiles,
      clampRange: config.constraints.clampRange,
      sizeProxy: config.constraints.sizeProxy,
    });
    const { profile: constraints, metadata: profileMeta } = profiler.profile(normalized);

    logger.info('Profiling complete', profileMeta);

    // Apply additional key field configuration
    for (const keyField of config.keys.keyFields) {
      constraints.keyFields.additionalKeys.push({
        fieldPath: keyField,
        type: 'string', // Infer from schema if needed
        enforceUniqueness: config.keys.enforceUniqueKeys,
        uniquenessScope: config.keys.uniquenessScope,
      });
    }

    // Write constraints
    const constraintsPath = resolve(config.output.dir, 'constraints.json');
    // Convert Map to plain object for JSON serialization
    const constraintsJson = {
      ...constraints,
      arrayStats: Object.fromEntries(constraints.arrayStats),
    };
    writeFileSync(constraintsPath, JSON.stringify(constraintsJson, null, 2), 'utf-8');

    // Step 5: Synthesize generation schema
    logger.info('Synthesizing generation schema');
    const synthesizer = new Synthesizer({
      enforceRequired: true,
      includeMetadata: true,
    });
    const { schema: generationSchema, metadata: synthMeta } = synthesizer.synthesize(
      inferredSchema,
      constraints,
      typeHints
    );

    logger.info('Generation schema synthesized', synthMeta);

    // Write generation schema
    const generationSchemaPath = resolve(config.output.dir, 'generation.schema.json');
    writeFileSync(generationSchemaPath, JSON.stringify(generationSchema, null, 2), 'utf-8');

    const duration = Date.now() - startTime;

    // Output success result
    const result = {
      status: 'success',
      phase: 'discovery',
      artifacts: {
        inferredSchema: inferredSchemaPath,
        generationSchema: generationSchemaPath,
        constraints: constraintsPath,
      },
      summary: {
        sampledDocuments: samples.length,
        fieldsInferred: inferMeta.fieldsDiscovered,
        arrayPathsTracked: profileMeta.arrayFieldsFound,
        durationMs: duration,
      },
    };

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    const errorResult = {
      status: 'error',
      phase: 'discovery',
      error: {
        code: error instanceof Error && error.message.includes('MongoDB') ? 'MONGO_CONNECTION_ERROR' : 'GENERAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof Error && error.cause ? String(error.cause) : undefined,
      },
    };

    console.error(JSON.stringify(errorResult, null, 2));
    process.exit(error instanceof Error && error.message.includes('config') ? 2 : 1);
  }
}

/**
 * Create infer command
 */
export function createInferCommand(): Command {
  const command = new Command('infer');

  command
    .description(
      'Sample MongoDB collection, infer schema with dynamic key detection, and produce discovery artifacts'
    )
    .option('--source-uri <uri>', 'MongoDB connection URI')
    .option('--source-db <database>', 'Source database name')
    .option('--source-collection <collection>', 'Source collection name')
    .option('--sample-size <count>', 'Number of documents to sample', (val) => parseInt(val, 10))
    .option('--sampling-strategy <strategy>', 'Sampling strategy: random, first-n, time-windowed', 'random')
    .option('--time-field <field>', 'Field for time-windowed sampling')
    .option('--output-dir <path>', 'Directory for output artifacts', './output')
    .option('--array-len-policy <policy>', 'Array length policy: minmax, percentileClamp', 'percentileClamp')
    .option('--percentiles <values>', 'Percentiles to track (comma-separated)', '50,90,99')
    .option('--clamp-range <range>', 'Percentile clamping range [low,high]', '1,99')
    .option('--id-policy <policy>', 'ID policy: objectid, uuid, string, number, inferred', 'inferred')
    .option('--key-fields <fields>', 'Additional key fields (comma-separated)', '')
    .option('--enforce-unique-keys', 'Enforce uniqueness for key fields', false)
    .option('--uniqueness-scope <scope>', 'Uniqueness scope: batch, run', 'run')
    .option(
      '--dynamic-key-threshold <number>',
      'Minimum unique keys to trigger dynamic key detection (default: 50)',
      (val) => parseInt(val, 10)
    )
    .option(
      '--no-dynamic-keys',
      'Disable dynamic key detection and inference for objects with highly variable keys'
    )
    .option('--config <path>', 'Path to configuration file (JSON/YAML)')
    .option('--log-level <level>', 'Logging verbosity: error, warn, info, debug', 'info')
    .action(executeInfer);

  return command;
}
