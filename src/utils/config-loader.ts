/**
 * Configuration loader for dynamic key detection
 * Feature: 002-dynamic-key-inference
 */

import {
  DynamicKeyDetectionConfig,
  DEFAULT_DYNAMIC_KEY_CONFIG,
} from "../types/dynamic-keys.js";
import { logger } from "./logger.js";

/**
 * CLI options for dynamic key detection
 */
export interface DynamicKeyCliOptions {
  dynamicKeyThreshold?: number;
  noDynamicKeys?: boolean;
  dynamicKeyMinPatternMatch?: number;
  dynamicKeyConfidenceThreshold?: number;
  forceStaticPaths?: string; // Comma-separated paths
  forceDynamicPaths?: string; // Comma-separated paths
}

/**
 * Config file section for dynamic key detection
 */
export interface DynamicKeyConfigSection {
  enabled?: boolean;
  threshold?: number;
  patterns?: {
    name: string;
    regex: string;
  }[];
  minPatternMatch?: number;
  confidenceThreshold?: number;
  forceStaticPaths?: string[];
  forceDynamicPaths?: string[];
}

/**
 * Load dynamic key detection configuration from CLI options and config file
 *
 * @param cliOptions - CLI flags for dynamic key detection
 * @param configFile - Optional config file section
 * @returns Merged configuration with defaults applied
 *
 * @example
 * const config = loadDynamicKeyConfig(
 *   { dynamicKeyThreshold: 100, noDynamicKeys: false },
 *   { threshold: 75 }
 * );
 * // Returns: config with threshold: 100 (CLI takes precedence)
 */
export function loadDynamicKeyConfig(
  cliOptions: DynamicKeyCliOptions = {},
  configFile: DynamicKeyConfigSection = {},
): DynamicKeyDetectionConfig {
  // If --no-dynamic-keys is set, return a config that will always fail detection
  if (cliOptions.noDynamicKeys) {
    logger.info("Dynamic key detection disabled via --no-dynamic-keys flag");
    return {
      ...DEFAULT_DYNAMIC_KEY_CONFIG,
      threshold: Number.MAX_SAFE_INTEGER, // Effectively disable count-based detection
      minPatternMatch: 1.1, // Impossible to reach (ratios are 0-1), disables pattern-based detection
    };
  }

  // If config file explicitly disables, respect that
  if (configFile.enabled === false) {
    logger.info("Dynamic key detection disabled via config file");
    return {
      ...DEFAULT_DYNAMIC_KEY_CONFIG,
      threshold: Number.MAX_SAFE_INTEGER,
      minPatternMatch: 1.1, // Impossible to reach, disables pattern-based detection
    };
  }

  // Parse comma-separated path lists from CLI
  const forceStaticPaths = cliOptions.forceStaticPaths
    ? cliOptions.forceStaticPaths.split(",").map((p) => p.trim())
    : undefined;

  const forceDynamicPaths = cliOptions.forceDynamicPaths
    ? cliOptions.forceDynamicPaths.split(",").map((p) => p.trim())
    : undefined;

  // Build config with precedence: CLI > config file > defaults
  const config: DynamicKeyDetectionConfig = {
    threshold:
      cliOptions.dynamicKeyThreshold ??
      configFile.threshold ??
      DEFAULT_DYNAMIC_KEY_CONFIG.threshold,

    patterns: configFile.patterns ?? DEFAULT_DYNAMIC_KEY_CONFIG.patterns,

    minPatternMatch:
      cliOptions.dynamicKeyMinPatternMatch ??
      configFile.minPatternMatch ??
      DEFAULT_DYNAMIC_KEY_CONFIG.minPatternMatch,

    confidenceThreshold:
      cliOptions.dynamicKeyConfidenceThreshold ??
      configFile.confidenceThreshold ??
      DEFAULT_DYNAMIC_KEY_CONFIG.confidenceThreshold,

    forceStaticPaths:
      forceStaticPaths ??
      configFile.forceStaticPaths ??
      DEFAULT_DYNAMIC_KEY_CONFIG.forceStaticPaths,

    forceDynamicPaths:
      forceDynamicPaths ??
      configFile.forceDynamicPaths ??
      DEFAULT_DYNAMIC_KEY_CONFIG.forceDynamicPaths,
  };

  // Validate configuration
  validateDynamicKeyConfig(config);

  logger.debug("Dynamic key detection config loaded", {
    threshold: config.threshold,
    patternsCount: config.patterns.length,
    minPatternMatch: config.minPatternMatch,
    confidenceThreshold: config.confidenceThreshold,
  });

  return config;
}

/**
 * Validate dynamic key detection configuration
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateDynamicKeyConfig(
  config: DynamicKeyDetectionConfig,
): void {
  // Validate threshold
  if (config.threshold < 2) {
    throw new Error(
      `Dynamic key threshold must be >= 2, got ${config.threshold}`,
    );
  }

  // Validate minPatternMatch
  if (config.minPatternMatch < 0 || config.minPatternMatch > 1) {
    throw new Error(
      `minPatternMatch must be between 0.0 and 1.0, got ${config.minPatternMatch}`,
    );
  }

  // Validate confidenceThreshold
  if (config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
    throw new Error(
      `confidenceThreshold must be between 0.0 and 1.0, got ${config.confidenceThreshold}`,
    );
  }

  // Validate patterns
  if (config.patterns.length === 0) {
    throw new Error("At least one pattern must be defined");
  }

  // Validate pattern names are unique
  const patternNames = new Set<string>();
  for (const pattern of config.patterns) {
    if (patternNames.has(pattern.name)) {
      throw new Error(`Duplicate pattern name: ${pattern.name}`);
    }
    patternNames.add(pattern.name);

    // Validate regex is valid
    try {
      new RegExp(pattern.regex);
    } catch (error) {
      throw new Error(
        `Invalid regex pattern for ${pattern.name}: ${pattern.regex}`,
        { cause: error },
      );
    }
  }

  // Validate path lists don't overlap
  const staticSet = new Set(config.forceStaticPaths);
  const dynamicSet = new Set(config.forceDynamicPaths);

  for (const path of config.forceStaticPaths) {
    if (dynamicSet.has(path)) {
      throw new Error(
        `Path cannot be in both forceStaticPaths and forceDynamicPaths: ${path}`,
      );
    }
  }
}

/**
 * Check if a field path should be forced as static keys
 *
 * @param fieldPath - Field path to check
 * @param config - Dynamic key detection configuration
 * @returns True if path should be treated as static keys
 */
export function isPathForcedStatic(
  fieldPath: string,
  config: DynamicKeyDetectionConfig,
): boolean {
  return config.forceStaticPaths.some(
    (pattern) => fieldPath === pattern || fieldPath.startsWith(pattern + "."),
  );
}

/**
 * Check if a field path should be forced as dynamic keys
 *
 * @param fieldPath - Field path to check
 * @param config - Dynamic key detection configuration
 * @returns True if path should be treated as dynamic keys
 */
export function isPathForcedDynamic(
  fieldPath: string,
  config: DynamicKeyDetectionConfig,
): boolean {
  return config.forceDynamicPaths.some(
    (pattern) => fieldPath === pattern || fieldPath.startsWith(pattern + "."),
  );
}
