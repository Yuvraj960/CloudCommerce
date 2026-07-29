/**
 * CloudCommerce root ESLint configuration.
 * All workspaces inherit this via ESLint's upward config walk.
 * Run from repo root: npx eslint <paths...>
 * Or per workspace: npm run lint --workspace=services/auth-service
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // Reasonable defaults
    'no-console': 'warn',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.config.js',
    'src/**/*.test.ts',
    'src/**/*.spec.ts',
  ],
}