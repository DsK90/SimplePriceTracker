/**
 * Nest + TypeScript: no type-aware ESLint project (avoids bogus decorator/DI noise).
 * Formatting: `npm run format` (Prettier) — not duplicated as ESLint rules.
 */
module.exports = {
  root: true,
  env: { node: true, jest: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // eslint-config-prettier only — turns off style rules that fight Prettier
  ],
  ignorePatterns: [
    '.eslintrc.js',
    'dist',
    'node_modules',
    'coverage',
    'prisma/seed.cjs',
  ],
  rules: {
    // TypeScript
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      },
    ],
    // Nest / servers log to console
    'no-console': 'off',
  },
};
