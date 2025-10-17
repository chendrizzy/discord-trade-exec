module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.js', '!src/index.js', '!**/node_modules/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/SignalParser.js': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/services/TradeExecutor.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/',  // Exclude Playwright E2E tests (run with `npx playwright test`)
    '\\.spec\\.js$' // Exclude .spec.js files (Playwright convention)
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  // Transform ESM modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(moomoo-api)/)'
  ],
  // Use manual mocks for ESM modules
  moduleNameMapper: {
    '^moomoo-api$': '<rootDir>/__mocks__/moomoo-api.js',
    '^@/(.*)$': '<rootDir>/src/dashboard/$1'
  }
};
