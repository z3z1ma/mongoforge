/**
 * Key pattern detection utilities for dynamic key inference
 * Feature: 002-dynamic-key-inference
 */

import type {
  DynamicKeyPattern,
  DynamicKeyDetectionConfig,
  ConfidenceLevel,
} from '../types/dynamic-keys.js';

/**
 * Compiled regex patterns for dynamic key detection
 */
interface CompiledPattern {
  name: DynamicKeyPattern;
  regex: RegExp;
  description: string;
}

/**
 * Built-in dynamic key patterns
 */
export const DYNAMIC_KEY_PATTERNS: CompiledPattern[] = [
  {
    name: 'UUID',
    regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    description: 'Standard UUID v4 format',
  },
  {
    name: 'MONGODB_OBJECTID',
    regex: /^[0-9a-f]{24}$/i,
    description: 'MongoDB ObjectId (24 hex characters)',
  },
  {
    name: 'ULID',
    regex: /^[0-9A-Z]{26}$/,
    description: 'Universally Unique Lexicographically Sortable Identifier',
  },
  {
    name: 'NUMERIC_ID',
    regex: /^\d{6,20}$/,
    description: 'Numeric identifier (6-20 digits)',
  },
  {
    name: 'PREFIXED_ID',
    regex: /^(user|doc|item|order)_[a-z0-9]{8,32}$/i,
    description: 'Prefixed alphanumeric identifier',
  },
];

/**
 * Pattern match result
 */
export interface PatternMatch {
  pattern: DynamicKeyPattern;
  matchCount: number;
  totalKeys: number;
  matchRatio: number;
  matchedKeys: string[];
}

/**
 * Detection result
 */
export interface DetectionResult {
  detected: boolean;
  pattern: DynamicKeyPattern | null;
  customPattern?: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  totalKeys: number;
  matchCount: number;
  matchRatio: number;
  exampleKeys: string[];
}

/**
 * Compile regex patterns from configuration
 *
 * @param config - Dynamic key detection configuration
 * @returns Array of compiled patterns
 */
export function compilePatterns(
  config: DynamicKeyDetectionConfig
): CompiledPattern[] {
  const compiled: CompiledPattern[] = [];

  for (const pattern of config.patterns) {
    try {
      const regex = new RegExp(pattern.regex);
      compiled.push({
        name: pattern.name as DynamicKeyPattern,
        regex,
        description: pattern.name,
      });
    } catch (error) {
      throw new Error(
        `Invalid regex pattern for ${pattern.name}: ${pattern.regex}`
      );
    }
  }

  return compiled;
}

/**
 * Test a single key against a regex pattern
 *
 * @param key - Key string to test
 * @param pattern - Compiled pattern
 * @returns True if key matches pattern
 */
export function testKeyPattern(key: string, pattern: CompiledPattern): boolean {
  return pattern.regex.test(key);
}

/**
 * Calculate pattern match ratio for a set of keys
 *
 * @param keys - Array of key strings
 * @param pattern - Compiled pattern
 * @returns Pattern match information
 */
export function calculatePatternMatch(
  keys: string[],
  pattern: CompiledPattern
): PatternMatch {
  const matchedKeys: string[] = [];

  for (const key of keys) {
    if (testKeyPattern(key, pattern)) {
      matchedKeys.push(key);
    }
  }

  const matchCount = matchedKeys.length;
  const totalKeys = keys.length;
  const matchRatio = totalKeys > 0 ? matchCount / totalKeys : 0;

  return {
    pattern: pattern.name,
    matchCount,
    totalKeys,
    matchRatio,
    matchedKeys,
  };
}

/**
 * Find best matching pattern for a set of keys
 *
 * @param keys - Array of key strings
 * @param patterns - Array of compiled patterns to test
 * @returns Best pattern match or null if no good match
 */
export function findBestPattern(
  keys: string[],
  patterns: CompiledPattern[]
): PatternMatch | null {
  let bestMatch: PatternMatch | null = null;
  let bestRatio = 0;

  for (const pattern of patterns) {
    const match = calculatePatternMatch(keys, pattern);

    if (match.matchRatio > bestRatio) {
      bestRatio = match.matchRatio;
      bestMatch = match;
    }
  }

  return bestMatch;
}

/**
 * Compute confidence score based on pattern match ratio and key count
 *
 * @param matchRatio - Ratio of keys matching pattern (0.0 - 1.0)
 * @param keyCount - Total number of keys analyzed
 * @param threshold - Detection threshold for key count
 * @returns Confidence score (0.0 - 1.0)
 */
export function computeConfidenceScore(
  matchRatio: number,
  keyCount: number,
  threshold: number
): number {
  // Base confidence from match ratio
  let confidence = matchRatio;

  // Boost confidence if key count significantly exceeds threshold
  const exceedanceRatio = keyCount / threshold;
  if (exceedanceRatio > 2) {
    // Add up to 0.1 bonus for very high key counts
    const bonus = Math.min(0.1, (exceedanceRatio - 2) * 0.02);
    confidence = Math.min(1.0, confidence + bonus);
  }

  return confidence;
}

/**
 * Categorize confidence score into levels
 *
 * @param confidence - Confidence score (0.0 - 1.0)
 * @returns Confidence level category
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

/**
 * Detect dynamic keys in a set of object keys
 *
 * Uses OR-based detection: detects if EITHER pattern match is strong OR key count is high.
 * This prevents false negatives from requiring both conditions.
 *
 * Detection paths:
 * 1. Pattern-based: ≥minPatternMatch (default 80%) of keys match a pattern (regardless of count)
 * 2. Count-based: Key count ≥ threshold (default 50) (regardless of pattern)
 * 3. Hybrid: Both conditions met provides highest confidence
 *
 * @param keys - Array of key strings from object properties
 * @param config - Dynamic key detection configuration
 * @returns Detection result with pattern and confidence information
 *
 * @example
 * // Pattern-based detection (12 keys, 100% UUID match)
 * const keys = [
 *   'a0b1c2d3-e4f5-6789-abcd-ef0123456789',
 *   'b1c2d3e4-f5a6-789b-cdef-0123456789ab',
 *   // ... 10 more UUIDs
 * ];
 * const result = detectDynamicKeys(keys, config);
 * // Returns: { detected: true, pattern: 'UUID', confidence: 0.85, ... }
 *
 * @example
 * // Count-based detection (150 keys, no pattern match)
 * const keys = ['johns-post', 'marys-article', ...]; // 150 unique user slugs
 * const result = detectDynamicKeys(keys, config);
 * // Returns: { detected: true, pattern: null, confidence: 0.65, ... }
 */
export function detectDynamicKeys(
  keys: string[],
  config: DynamicKeyDetectionConfig
): DetectionResult {
  const totalKeys = keys.length;

  // Compile and test patterns
  const patterns = compilePatterns(config);
  const bestMatch = findBestPattern(keys, patterns);

  // Calculate metrics
  const matchRatio = bestMatch?.matchRatio || 0;
  const matchCount = bestMatch?.matchCount || 0;
  const pattern = bestMatch?.pattern || null;

  // OR-based detection conditions
  const meetsCountThreshold = totalKeys >= config.threshold;
  const meetsPatternThreshold = matchRatio >= config.minPatternMatch;

  // Detect if EITHER condition is met
  const shouldDetect = meetsCountThreshold || meetsPatternThreshold;

  if (!shouldDetect) {
    return {
      detected: false,
      pattern,
      confidence: matchRatio,
      confidenceLevel: getConfidenceLevel(matchRatio),
      totalKeys,
      matchCount,
      matchRatio,
      exampleKeys: keys.slice(0, 10),
    };
  }

  // Compute confidence score based on which conditions were met
  let confidence: number;

  if (meetsPatternThreshold && meetsCountThreshold) {
    // Hybrid: Both conditions met - highest confidence
    confidence = computeConfidenceScore(matchRatio, totalKeys, config.threshold);
  } else if (meetsPatternThreshold) {
    // Pattern-based only: Use pattern match ratio as base, slight boost for pattern clarity
    confidence = Math.min(1.0, matchRatio + 0.05);
  } else {
    // Count-based only: Base confidence from high cardinality
    // Start at confidenceThreshold (e.g., 0.7) and scale up to 0.9 based on exceedance
    const exceedanceRatio = totalKeys / config.threshold;
    const baseConfidence = config.confidenceThreshold;
    const maxConfidence = 0.9;
    const scaleFactor = Math.log10(exceedanceRatio) * 0.2;
    confidence = Math.min(maxConfidence, baseConfidence + scaleFactor);
  }

  // Final confidence threshold check
  const detected = confidence >= config.confidenceThreshold;

  return {
    detected,
    pattern,
    customPattern: !pattern ? 'HIGH_CARDINALITY' : undefined,
    confidence,
    confidenceLevel: getConfidenceLevel(confidence),
    totalKeys,
    matchCount,
    matchRatio,
    exampleKeys: bestMatch?.matchedKeys.slice(0, 10) || keys.slice(0, 10),
  };
}
