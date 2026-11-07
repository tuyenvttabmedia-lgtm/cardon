/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/*.it.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
};
