const { faker } = require('@faker-js/faker');

// Example custom generators for testing
module.exports = {
  pathGenerators: {
    'customer.email': () => {
      // Strip non-alphabetic characters to ensure consistent format
      const firstName = faker.person.firstName().toLowerCase().replace(/[^a-z]/g, '');
      const lastName = faker.person.lastName().toLowerCase().replace(/[^a-z]/g, '');
      return `${firstName}.${lastName}@company.com`;
    },
    'order._id': () => {
      const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
      const prefix = timestamp.toString(16).padStart(8, '0');
      const randomSuffix = faker.string.hexadecimal({ length: 32, prefix: '' });
      return `${prefix}${randomSuffix}`;
    }
  },
  typeGenerators: {
    'date': () => {
      // Custom date generator for future dates
      return faker.date.future().toISOString();
    }
  }
};