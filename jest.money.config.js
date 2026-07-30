const base = require('./jest.config');

/**
 * CI gate for the money path: checkout → payment → agent ledger → provider
 * fulfillment → reconciliation. Suites are listed explicitly so a money-critical
 * spec cannot silently drop out of the gate when files move or get renamed.
 */
module.exports = {
  ...base,
  testRegex: undefined,
  testMatch: [
    '<rootDir>/modules/order/**/*.spec.ts',
    '<rootDir>/modules/payment/**/*.spec.ts',
    '<rootDir>/modules/provider/**/*.spec.ts',
    '<rootDir>/modules/finance/**/*.spec.ts',
    '<rootDir>/modules/agent/**/*.spec.ts',
    '<rootDir>/modules/agent-api/**/*.spec.ts',
    '<rootDir>/modules/agent-deposit/**/*.spec.ts',
    '<rootDir>/modules/operations-center/**/*.spec.ts',
    '<rootDir>/config/production-env.rules.spec.ts',
  ],
};
