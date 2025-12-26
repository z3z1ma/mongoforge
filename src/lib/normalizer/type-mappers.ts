/**
 * BSON type to JSON Schema type mappers
 */

import { ObjectId, Decimal128, Binary } from 'mongodb';
import { TypeHint } from '../../types/data-model.js';

/**
 * ObjectId → string mapper
 */
export function mapObjectId(value: ObjectId): { value: string; hint: TypeHint } {
  return {
    value: value.toString(),
    hint: {
      originalType: 'ObjectId',
      jsonSchemaType: 'string',
      jsonSchemaFormat: 'objectid',
    },
  };
}

/**
 * Date → ISO 8601 string mapper
 */
export function mapDate(value: Date): { value: string; hint: TypeHint } {
  return {
    value: value.toISOString(),
    hint: {
      originalType: 'Date',
      jsonSchemaType: 'string',
      jsonSchemaFormat: 'date-time',
    },
  };
}

/**
 * Decimal128 → string mapper
 */
export function mapDecimal128(value: Decimal128): { value: string; hint: TypeHint } {
  return {
    value: value.toString(),
    hint: {
      originalType: 'Decimal128',
      jsonSchemaType: 'string',
      jsonSchemaFormat: 'decimal',
    },
  };
}

/**
 * BinData → base64 string mapper
 */
export function mapBinData(value: Binary): { value: string; hint: TypeHint } {
  return {
    value: value.toString('base64'),
    hint: {
      originalType: 'BinData',
      jsonSchemaType: 'string',
      jsonSchemaFormat: 'base64',
    },
  };
}

/**
 * Type detection and mapping dispatcher
 */
export function mapValue(value: any, fieldPath: string): { value: any; hint: TypeHint | null } {
  // ObjectId
  if (value instanceof ObjectId) {
    return mapObjectId(value);
  }

  // Date
  if (value instanceof Date) {
    return mapDate(value);
  }

  // Decimal128
  if (value && value._bsontype === 'Decimal128') {
    return mapDecimal128(value as Decimal128);
  }

  // Binary
  if (value instanceof Binary || (value && value._bsontype === 'Binary')) {
    return mapBinData(value as Binary);
  }

  // No mapping needed
  return { value, hint: null };
}

/**
 * Recursively map all values in a document
 */
export function mapDocument(
  doc: any,
  pathPrefix = ''
): { doc: any; hints: Record<string, TypeHint> } {
  const result: any = {};
  const hints: Record<string, TypeHint> = {};

  for (const [key, value] of Object.entries(doc)) {
    const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      result[key] = value.map((item, index) => {
        const itemPath = `${fieldPath}[${index}]`;
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const mapped = mapDocument(item, itemPath);
          Object.assign(hints, mapped.hints);
          return mapped.doc;
        } else {
          const mapped = mapValue(item, itemPath);
          if (mapped.hint) {
            hints[itemPath] = mapped.hint;
          }
          return mapped.value;
        }
      });
      continue;
    }

    // Handle nested objects - but check for BSON types first
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Check if this is a BSON type that needs mapping
      const mappedValue = mapValue(value, fieldPath);
      if (mappedValue.hint) {
        // It's a BSON type, use mapped value
        result[key] = mappedValue.value;
        hints[fieldPath] = mappedValue.hint;
      } else {
        // It's a plain nested object, recurse
        const mapped = mapDocument(value, fieldPath);
        result[key] = mapped.doc;
        Object.assign(hints, mapped.hints);
      }
      continue;
    }

    // Handle primitives
    const mapped = mapValue(value, fieldPath);
    result[key] = mapped.value;
    if (mapped.hint) {
      hints[fieldPath] = mapped.hint;
    }
  }

  return { doc: result, hints };
}
