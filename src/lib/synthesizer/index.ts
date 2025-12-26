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
} from './vendor-keywords.js';
import { extractFieldPaths, isFieldRequired } from '../inferencer/mongodb-schema-wrapper.js';
import { logger } from '../../utils/logger.js';

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
 * Map mongodb-schema type to JSON Schema format
 */
function getJsonSchemaFormat(mongoSchemaType: string, typeHint?: TypeHint): string | undefined {
  // Use type hint if available
  if (typeHint?.jsonSchemaFormat) {
    return typeHint.jsonSchemaFormat;
  }

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
  keyFields: Set<string>
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
  const format = getJsonSchemaFormat(primaryType as string, typeHint);

  // Ensure we always have a valid type
  const validType = jsonSchemaType || 'string';

  const property: GenerationSchemaProperty = {
    type: validType,
  };

  if (format) {
    property.format = format;
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
          min: arrayStats.minLen,
          max: arrayStats.maxLen,
          p50: arrayStats.p50Len,
          p90: arrayStats.p90Len,
          p99: arrayStats.p99Len,
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
    }
  }

  // Handle nested document types
  if (primaryType === 'Document' && field.fields) {
    property.properties = {};
    property.required = [];

    for (const [nestedFieldName, nestedField] of Object.entries(field.fields)) {
      const nestedPath = `${fieldPath}.${nestedFieldName}`;
      property.properties[nestedFieldName] = transformField(
        nestedField,
        nestedPath,
        constraints,
        typeHints,
        keyFields
      );

      // Add to required if field probability is high
      if (nestedField.probability >= 0.95) {
        property.required.push(nestedFieldName);
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
  options: Partial<SynthesizerOptions> = {}
): GenerationSchema {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info('Synthesizing generation schema', {
    fieldsInferred: Object.keys(inferredSchema.fields).length,
    arrayStatsCount: constraints.arrayStats.size,
    enforceRequired: opts.enforceRequired,
  });

  // Build set of key fields (T054)
  const keyFields = new Set<string>(['_id']);
  for (const additionalKey of constraints.keyFields.additionalKeys) {
    keyFields.add(additionalKey.fieldPath);
  }

  // Transform top-level fields
  const properties: Record<string, GenerationSchemaProperty> = {};
  let vendorExtensionsApplied = 0;

  for (const [fieldName, field] of Object.entries(inferredSchema.fields)) {
    const property = transformField(field, fieldName, constraints, typeHints, keyFields);
    properties[fieldName] = property;

    if (property['x-gen']) {
      vendorExtensionsApplied++;
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
    additionalProperties: true,
  };

  logger.info('Generation schema synthesized', {
    propertiesCount: Object.keys(properties).length,
    requiredFields: required.length,
    vendorExtensionsApplied,
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
    typeHints: Map<string, TypeHint>
  ): SynthesizerResult {
    const schema = synthesize(inferredSchema, constraints, typeHints, this.options);

    return {
      schema,
      metadata: {
        fieldsProcessed: Object.keys(schema.properties).length,
        vendorExtensionsApplied: Object.values(schema.properties).filter((p) => p['x-gen'])
          .length,
      },
    };
  }
}
