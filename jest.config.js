/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/migrate.js',
    '!server/bootstrap.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],
  verbose: true,
};
