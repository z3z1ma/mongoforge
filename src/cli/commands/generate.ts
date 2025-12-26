import { Command } from 'commander';
import { loadCustomGenerators } from '../../lib/generator/module-loader';
import {
  registerPathGenerator,
  registerTypeGenerator
} from '../../lib/generator/custom-formats';

export function setupGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate synthetic MongoDB documents')
    .option('-c, --custom-generators <path>', 'Path to custom generator JavaScript module')
    .action(async (options) => {
      if (options.customGenerators) {
        try {
          const customGenerators = await loadCustomGenerators(options.customGenerators);

          // Register path generators
          customGenerators.pathGenerators.forEach((gen, path) => {
            registerPathGenerator(path, gen);
          });

          // Register type generators
          customGenerators.typeGenerators.forEach((gen, type) => {
            registerTypeGenerator(type, gen);
          });
        } catch (error) {
          console.error(`Failed to load custom generators: ${error.message}`);
          process.exit(1);
        }
      }

      // Actual generation logic would go here
      console.log('Generating documents...');
    });
}