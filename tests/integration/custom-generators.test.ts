import { describe, it, expect } from 'vitest';
import { loadCustomGenerators } from '../../src/lib/generator/module-loader';
import {
  registerPathGenerator,
  registerTypeGenerator,
  getCustomGenerator
} from '../../src/lib/generator/custom-formats';
import path from 'path';

describe('Custom Generators', () => {
  const customGeneratorsFixture = path.resolve(__dirname, '../fixtures/custom-generators.js');

  it('should load custom generators from a module', async () => {
    const customGenerators = await loadCustomGenerators(customGeneratorsFixture);

    expect(customGenerators.pathGenerators.size).toBe(2);
    expect(customGenerators.typeGenerators.size).toBe(1);
  });

  it('should register and use path-specific generators', async () => {
    const customGenerators = await loadCustomGenerators(customGeneratorsFixture);

    // Register path generators
    customGenerators.pathGenerators.forEach((gen, path) => {
      registerPathGenerator(path, gen);
    });

    const customerEmailGen = getCustomGenerator('customer.email');
    const orderIdGen = getCustomGenerator('order._id');

    expect(customerEmailGen).toBeDefined();
    expect(orderIdGen).toBeDefined();

    const email = customerEmailGen!();
    const orderId = orderIdGen!();

    expect(email).toMatch(/^[a-z]+\.[a-z]+@company\.com$/);
    expect(orderId).toHaveLength(40); // 8-char timestamp + 32-char random
  });

  it('should register and use type-based generators', async () => {
    const customGenerators = await loadCustomGenerators(customGeneratorsFixture);

    // Register type generators
    customGenerators.typeGenerators.forEach((gen, type) => {
      registerTypeGenerator(type, gen);
    });

    const dateGen = getCustomGenerator(undefined, 'date');

    expect(dateGen).toBeDefined();

    const date = dateGen!();
    const parsedDate = new Date(date);

    expect(parsedDate.toISOString()).toBe(date);
    expect(parsedDate > new Date()).toBe(true); // Future date
  });

  it('should respect generator precedence', async () => {
    // Path-specific > Type-level
    registerPathGenerator('user.email', () => 'path-specific@test.com');
    registerTypeGenerator('email', () => 'type-level@test.com');

    const pathGen = getCustomGenerator('user.email', 'email');
    const typeGen = getCustomGenerator(undefined, 'email');

    expect(pathGen!()).toBe('path-specific@test.com');
    expect(typeGen!()).toBe('type-level@test.com');
  });
});