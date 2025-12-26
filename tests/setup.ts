/**
 * Vitest setup file
 * Polyfills for browser-specific globals used by dependencies
 */

// Polyfill for 'location' object required by json-schema-faker
global.location = {
  href: 'file://localhost/',
  protocol: 'file:',
  host: 'localhost',
  hostname: 'localhost',
  port: '',
  pathname: '/',
  search: '',
  hash: '',
} as any;
