module.exports = {
  testEnvironment: 'node',
  // Coverage disabled in Jest - using c8 instead for Node v25 compatibility
  collectCoverage: false,
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/', // Exclude Playwright E2E tests (run with `npx playwright test`)
    '\\.spec\\.js$' // Exclude .spec.js files (Playwright convention)
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  // Transform ESM modules from node_modules
  transformIgnorePatterns: ['node_modules/(?!(moomoo-api)/)'],
  // Use manual mocks for ESM modules
  moduleNameMapper: {
    '^moomoo-api$': '<rootDir>/__mocks__/moomoo-api.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@commands/(.*)$': '<rootDir>/src/commands/$1'
  },
  // Global test setup for subscription gating feature
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};
