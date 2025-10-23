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
    '^@/(.*)$': '<rootDir>/src/dashboard/$1'
  }
};
