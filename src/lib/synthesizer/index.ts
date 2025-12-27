/**
 * Synthesizer module - transforms InferredSchema to GenerationSchema with vendor extensions
 */

import {
  InferredSchema,
  GenerationSchema,
  GenerationSchemaProperty,
  ConstraintsProfile,
  TypeHint,
  InferredSchemaField,
} from '../../types/data-model.js';
import { SynthesizerOptions, SynthesizerResult } from './types.js';
import {
  buildXGenExtensions,
  extractArrayConstraints,
  applyArrayLenExtension,
  addArrayLengthDistribution,
} from './vendor-keywords.js';
import { extractFieldPaths, isFieldRequired } from '../inferencer/mongodb-schema-wrapper.js';
import { logger } from '../../utils/logger.js';
import type { ObjectKeysAnalysis } from '../inferencer/dynamic-key-detector.js';
import type { DynamicKeyMetadata, DynamicKeyValueSchema } from '../../types/dynamic-keys.js';

export * from './types.js';
export * from './vendor-keywords.js';

/**
 * Default synthesizer options
 */
const DEFAULT_OPTIONS: SynthesizerOptions = {
  enforceRequired: true,
  includeMetadata: true,
};

/**
 * Build DynamicKeyValueSchema from analysis metadata
 */
function buildValueSchemaFromAnalysis(analysis: ObjectKeysAnalysis): DynamicKeyValueSchema {
  // Use the valueSchema from the analysis if available
  if (analysis.valueSchema) {
    return analysis.valueSchema;
  }

  // Fallback to simple string schema
  return {
    types: ['string'],
    typeProbabilities: [1.0],
    schemas: [{ type: 'string' }],
    isUniformType: true,
    dominantType: 'string',
  };
}

/**
 * Map mongodb-schema type to JSON Schema type
 */
function mapTypeToJsonSchema(mongoSchemaType: string | string[]): string | string[] {
  const typeMap: Record<string, string> = {
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    Array: 'array',
    Document: 'object',
    ObjectID: 'string',
    Date: 'string',
    Decimal128: 'string',
    Binary: 'string',
    Null: 'null',
  };

  if (Array.isArray(mongoSchemaType)) {
    const mapped = mongoSchemaType.map((t) => typeMap[t] || (t ? t.toLowerCase() : '') || 'string');
    if (mapped.length === 0) return 'string';
    const first = mapped[0];
    return mapped.length === 1 ? (first || 'string') : mapped;
  }

  const lowerType = typeof mongoSchemaType === 'string' ? mongoSchemaType.toLowerCase() : '';
  const result = typeMap[mongoSchemaType] || lowerType;
  return result || 'string'; // Always return a string, never undefined
}

/**
 * Map semantic types to JSON Schema format
 */
const SEMANTIC_TYPE_TO_FORMAT: Record<string, string> = {
  Email: 'email',
  URL: 'url',
  UUID: 'uuid',
  Phone: 'phone',
  PersonName: 'person-name',
  IPAddress: 'ipv4',
};

/**
 * Map mongodb-schema type to JSON Schema format
 * Checks for semantic types first, then type hints, then MongoDB types
 */
function getJsonSchemaFormat(
  mongoSchemaType: string,
  field: InferredSchemaField,
  typeHint?: TypeHint
): string | undefined {
  // Priority 1: MongoDB type hints (ObjectId, Date, etc.)
  if (typeHint?.jsonSchemaFormat) {
    return typeHint.jsonSchemaFormat;
  }

  // Priority 2a: Check if mongoSchemaType itself is a semantic type
  // (mongodb-schema changes type name from "String" to "Email" when detected)
  if (SEMANTIC_TYPE_TO_FORMAT[mongoSchemaType]) {
    return SEMANTIC_TYPE_TO_FORMAT[mongoSchemaType];
  }

  // Priority 2b: Check for our custom semantic types on String types
  if (field.types) {
    const stringType = field.types.find((t) => t.name === 'String');
    if (stringType?.semanticType) {
      const format = SEMANTIC_TYPE_TO_FORMAT[stringType.semanticType];
      if (format) {
        return format;
      }
    }
  }

  // Priority 3: MongoDB types
  const formatMap: Record<string, string> = {
    ObjectID: 'objectid',
    Date: 'date-time',
    Decimal128: 'decimal',
  };

  return formatMap[mongoSchemaType];
}

/**
 * Transform InferredSchemaField to GenerationSchemaProperty recursively
 */
function transformField(
  field: InferredSchemaField,
  fieldPath: string,
  constraints: ConstraintsProfile,
  typeHints: Map<string, TypeHint>,
  keyFields: Set<string>,
  dynamicKeyAnalyses?: Map<string, ObjectKeysAnalysis>
): GenerationSchemaProperty {
  const isKey = keyFields.has(fieldPath);
  const typeHint = typeHints.get(fieldPath);
  const arrayStats = constraints.arrayStats.get(fieldPath);

  // Determine primary type (most probable)
  let primaryType = field.type;
  if (Array.isArray(field.type)) {
    const mostProbableType = field.types.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );
    primaryType = mostProbableType.name;
  }

  const jsonSchemaType = mapTypeToJsonSchema(primaryType);
  const format = getJsonSchemaFormat(primaryType as string, field, typeHint);

  // Ensure we always have a valid type
  const validType = jsonSchemaType || 'string';

  const property: GenerationSchemaProperty = {
    type: validType,
  };

  if (format) {
    property.format = format;
  }

  // Apply numeric constraints (minimum/maximum) from profiler
  if (primaryType === 'Number') {
    const numericStats = constraints.numericRanges.get(fieldPath);
    if (numericStats) {
      property.minimum = numericStats.stats.min;
      property.maximum = numericStats.stats.max;

      // Add x-gen.numericRange extension for additional metadata
      if (!property['x-gen']) {
        property['x-gen'] = {};
      }
      property['x-gen'].numericRange = {
        mean: numericStats.mean,
        median: numericStats.stats.median,
        p95: numericStats.stats.p95,
        type: numericStats.valueType,
        allPositive: numericStats.allPositive,
      };

      logger.debug('Applied numeric constraints', {
        fieldPath,
        min: property.minimum,
        max: property.maximum,
        type: numericStats.valueType,
      });
    }
  }

  // Handle array types
  if (primaryType === 'Array' && field.types) {
    const arrayItemTypes = field.types.find((t) => t.name === 'Array');
    if (arrayItemTypes && field.fields) {
      // Get the item type from nested fields (mongodb-schema stores array items in fields)
      const itemField = Object.values(field.fields)[0];
      if (itemField) {
        property.items = transformField(
          itemField,
          `${fieldPath}[]`,
          constraints,
          typeHints,
          keyFields
        );
      }
    }

    // Fallback: create basic items schema if not set
    if (!property.items) {
      // Default to string type for array items
      property.items = { type: 'string' };
    }

    // Set minItems/maxItems from profiler stats (T053)
    if (arrayStats) {
      const arrayConstraints = extractArrayConstraints(
        {
          min: arrayStats.stats.min,
          max: arrayStats.stats.max,
          p50: arrayStats.stats.median,
          p90: Math.round(arrayStats.stats.p95 * 0.95),
          p99: arrayStats.stats.p95,
          strategy: constraints.config.arrayLenPolicy === 'minmax' ? 'minmax' : 'percentile',
        },
        constraints.config.arrayLenPolicy,
        constraints.config.clampRange
      );

      if (arrayConstraints.minItems !== undefined) {
        property.minItems = arrayConstraints.minItems;
      }
      if (arrayConstraints.maxItems !== undefined) {
        property.maxItems = arrayConstraints.maxItems;
      }

      // Add x-array-length-distribution annotation with full frequency distribution
      addArrayLengthDistribution(property, arrayStats);
    }
  }

  // Handle nested document types
  if (primaryType === 'Document' && field.fields) {
    // Check if this object has dynamic keys detected
    const dynamicKeyAnalysis = dynamicKeyAnalyses?.get(fieldPath);

    if (dynamicKeyAnalysis?.isDynamic && dynamicKeyAnalysis.metadata) {
      // Add x-dynamic-keys annotation instead of exhaustive properties
      property['x-dynamic-keys'] = {
        enabled: true,
        metadata: dynamicKeyAnalysis.metadata,
        valueSchema: buildValueSchemaFromAnalysis(dynamicKeyAnalysis),
      };

      // Don't add individual properties for dynamic key objects
      logger.debug('Adding x-dynamic-keys annotation', {
        fieldPath,
        pattern: dynamicKeyAnalysis.metadata.pattern,
        uniqueKeys: dynamicKeyAnalysis.metadata.uniqueKeysObserved,
      });
    } else {
      // Standard object with static keys
      property.properties = {};
      property.required = [];
      property.additionalProperties = false; // Prevent json-schema-faker from adding random properties

      for (const [nestedFieldName, nestedField] of Object.entries(field.fields)) {
        const nestedPath = `${fieldPath}.${nestedFieldName}`;
        property.properties[nestedFieldName] = transformField(
          nestedField,
          nestedPath,
          constraints,
          typeHints,
          keyFields,
          dynamicKeyAnalyses
        );

        // Add to required if field probability is high
        if (nestedField.probability >= 0.95) {
          property.required.push(nestedFieldName);
        }
      }
    }
  }

  // Build x-gen vendor extensions
  const xGen = buildXGenExtensions({
    fieldPath,
    isKeyField: isKey,
    typeHint,
    arrayStats,
    arrayLenStrategy: constraints.config.arrayLenPolicy === 'minmax' ? 'minmax' : 'percentile',
  });

  if (xGen) {
    property['x-gen'] = xGen;
  }

  return property;
}

/**
 * Transform InferredSchema to GenerationSchema
 */
export function synthesize(
  inferredSchema: InferredSchema,
  constraints: ConstraintsProfile,
  typeHints: Map<string, TypeHint>,
  options: Partial<SynthesizerOptions> = {},
  dynamicKeyAnalyses?: Map<string, ObjectKeysAnalysis>
): GenerationSchema {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info('Synthesizing generation schema', {
    fieldsInferred: Object.keys(inferredSchema.fields).length,
    arrayStatsCount: constraints.arrayStats.size,
    enforceRequired: opts.enforceRequired,
    dynamicKeyFields: dynamicKeyAnalyses?.size || 0,
  });

  // Build set of key fields (T054)
  const keyFields = new Set<string>(['_id']);
  for (const additionalKey of constraints.keyFields.additionalKeys) {
    keyFields.add(additionalKey.fieldPath);
  }

  // Transform top-level fields
  const properties: Record<string, GenerationSchemaProperty> = {};
  let vendorExtensionsApplied = 0;
  let dynamicKeysAnnotated = 0;

  for (const [fieldName, field] of Object.entries(inferredSchema.fields)) {
    const property = transformField(
      field,
      fieldName,
      constraints,
      typeHints,
      keyFields,
      dynamicKeyAnalyses
    );
    properties[fieldName] = property;

    if (property['x-gen']) {
      vendorExtensionsApplied++;
    }
    if (property['x-dynamic-keys']) {
      dynamicKeysAnnotated++;
    }
  }

  // Generate required array with _id + configured keys (T054)
  const required: string[] = ['_id'];
  for (const additionalKey of constraints.keyFields.additionalKeys) {
    if (!required.includes(additionalKey.fieldPath)) {
      required.push(additionalKey.fieldPath);
    }
  }

  // Add fields with high probability to required
  if (opts.enforceRequired) {
    for (const [fieldName, field] of Object.entries(inferredSchema.fields)) {
      if (field.probability >= 0.95 && !required.includes(fieldName)) {
        required.push(fieldName);
      }
    }
  }

  const generationSchema: GenerationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'SyntheticDocument',
    properties,
    required,
    additionalProperties: false,
  };

  logger.info('Generation schema synthesized', {
    propertiesCount: Object.keys(properties).length,
    requiredFields: required.length,
    vendorExtensionsApplied,
    dynamicKeysAnnotated,
  });

  return generationSchema;
}

/**
 * Main synthesizer class
 */
export class Synthesizer {
  private options: SynthesizerOptions;

  constructor(options: Partial<SynthesizerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  synthesize(
    inferredSchema: InferredSchema,
    constraints: ConstraintsProfile,
    typeHints: Map<string, TypeHint>,
    dynamicKeyAnalyses?: Map<string, ObjectKeysAnalysis>
  ): SynthesizerResult {
    const schema = synthesize(
      inferredSchema,
      constraints,
      typeHints,
      this.options,
      dynamicKeyAnalyses
    );

    const dynamicKeysAnnotated = Object.values(schema.properties).filter(
      (p) => p['x-dynamic-keys']
    ).length;

    return {
      schema,
      metadata: {
        fieldsProcessed: Object.keys(schema.properties).length,
        vendorExtensionsApplied: Object.values(schema.properties).filter((p) => p['x-gen'])
          .length,
        dynamicKeysAnnotated,
      },
    };
  }
}
