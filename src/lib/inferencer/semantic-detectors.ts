/**
 * Semantic type detectors for common data patterns
 * Detects email addresses, URLs, UUIDs, phone numbers, and person names
 */

export interface SemanticDetector {
  name: string;
  fieldPatterns: RegExp[];
  valueValidator: (value: any) => boolean;
  minConfidence: number; // Minimum match rate to apply (0.0-1.0)
  priority: number; // Lower = higher priority
}

/**
 * Email detector (uses regex from mongodb-schema's email.ts)
 */
const emailRegex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/i;

const EMAIL_DETECTOR: SemanticDetector = {
  name: 'Email',
  fieldPatterns: [/email/i, /e_?mail/i],
  valueValidator: (v) => typeof v === 'string' && emailRegex.test(v),
  minConfidence: 0.8,
  priority: 1,
};

/**
 * URL detector
 */
const URL_DETECTOR: SemanticDetector = {
  name: 'URL',
  fieldPatterns: [/url/i, /link/i, /href/i, /website/i, /endpoint/i],
  valueValidator: (v) => typeof v === 'string' && /^https?:\/\/.+/.test(v),
  minConfidence: 0.8,
  priority: 2,
};

/**
 * UUID detector (UUID v4 format)
 */
const UUID_DETECTOR: SemanticDetector = {
  name: 'UUID',
  fieldPatterns: [/uuid/i, /guid/i],
  valueValidator: (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  minConfidence: 0.9,
  priority: 3,
};

/**
 * Phone number detector
 */
const PHONE_DETECTOR: SemanticDetector = {
  name: 'Phone',
  fieldPatterns: [/phone/i, /mobile/i, /tel/i, /fax/i],
  valueValidator: (v) => {
    if (typeof v !== 'string') return false;
    // Match common formats: +1-555-123-4567, (555) 123-4567, 555.123.4567
    const cleaned = v.replace(/[\s.\-()]/g, '');
    return /^(\+?\d{1,3})?[\d]{7,15}$/.test(cleaned);
  },
  minConfidence: 0.7,
  priority: 4,
};

/**
 * Person name detector
 */
const PERSON_NAME_DETECTOR: SemanticDetector = {
  name: 'PersonName',
  fieldPatterns: [
    /^(first|last|full)_?name$/i,
    /^name$/i,
    /author/i,
    /^(created|updated)_?by$/i,
  ],
  valueValidator: (v) => {
    if (typeof v !== 'string') return false;
    // Basic heuristic: 2-50 chars, mostly letters/spaces/hyphens/apostrophes
    return v.length >= 2 && v.length <= 50 && /^[A-Za-z\s\-'.]+$/.test(v);
  },
  minConfidence: 0.6,
  priority: 5,
};

/**
 * IP Address detector
 */
const IP_ADDRESS_DETECTOR: SemanticDetector = {
  name: 'IPAddress',
  fieldPatterns: [/ip_?addr/i, /ip_?address/i, /client_ip/i],
  valueValidator: (v) => {
    if (typeof v !== 'string') return false;
    // IPv4: 192.168.1.1
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6: 2001:db8::1
    const ipv6 = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
    return ipv4.test(v) || ipv6.test(v);
  },
  minConfidence: 0.9,
  priority: 6,
};

/**
 * Built-in semantic detectors (core set only)
 */
export const BUILTIN_DETECTORS: SemanticDetector[] = [
  EMAIL_DETECTOR,
  URL_DETECTOR,
  UUID_DETECTOR,
  PHONE_DETECTOR,
  PERSON_NAME_DETECTOR,
  IP_ADDRESS_DETECTOR,
];

/**
 * Analyze a field for semantic type based on field name and values
 * Returns semantic type if confidence threshold is met
 */
export interface SemanticAnalysisResult {
  semanticType: string;
  confidence: number;
  sampleSize: number;
  matchCount: number;
}

export function analyzeFieldForSemanticType(
  fieldName: string,
  fieldPath: string,
  values: any[],
  detectors: SemanticDetector[] = BUILTIN_DETECTORS
): SemanticAnalysisResult | null {
  if (!values || values.length === 0) {
    return null;
  }

  // Sort detectors by priority (lower number = higher priority)
  const sortedDetectors = [...detectors].sort((a, b) => a.priority - b.priority);

  // Check each detector
  for (const detector of sortedDetectors) {
    // Check if field name matches pattern
    const nameMatches = detector.fieldPatterns.some((pattern) => pattern.test(fieldName) || pattern.test(fieldPath));

    if (!nameMatches) {
      continue;
    }

    // Validate values
    let matchCount = 0;
    for (const value of values) {
      if (detector.valueValidator(value)) {
        matchCount++;
      }
    }

    const confidence = matchCount / values.length;

    // Return if confidence threshold met
    if (confidence >= detector.minConfidence) {
      return {
        semanticType: detector.name,
        confidence,
        sampleSize: values.length,
        matchCount,
      };
    }
  }

  return null;
}

/**
 * Apply semantic type analysis to an inferred schema field
 * Mutates the field.types array to add semantic type metadata
 */
export function applySemanticTypes(
  field: any,
  detectors: SemanticDetector[] = BUILTIN_DETECTORS
): void {
  if (!field.types || !Array.isArray(field.types)) {
    return;
  }

  // Find String type entry
  const stringType = field.types.find((t: any) => t.name === 'String');
  if (!stringType || !stringType.values || stringType.values.length === 0) {
    return;
  }

  // Analyze values for semantic type
  const analysis = analyzeFieldForSemanticType(field.name, field.path, stringType.values, detectors);

  if (analysis) {
    stringType.semanticType = analysis.semanticType;
    stringType.semanticConfidence = analysis.confidence;
  }
}
