import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: 'node18',
  outDir: 'dist',
  // Only add shebang to CLI entry point
  esbuildOptions(options, context) {
    if (context.format === 'esm' && context.path.includes('cli')) {
      options.banner = {
        js: '#!/usr/bin/env node',
      };
    }
  },
});
