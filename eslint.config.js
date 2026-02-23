const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // === Style (matches current codebase conventions) ===
      'quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'semi': ['warn', 'always'],
      'indent': ['warn', 2, { SwitchCase: 1 }],
      'no-trailing-spaces': 'warn',
      'comma-dangle': ['warn', 'only-multiline'],
      'eol-last': ['warn', 'always'],

      // === Quality ===
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',  // console is OK for a bot
      'eqeqeq': ['warn', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-duplicate-case': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],

      // === Async ===
      'no-async-promise-executor': 'error',
      'require-await': 'warn',
      'no-return-await': 'warn',
    },
  },
  {
    // Less strict rules for tests
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'require-await': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'docs/'],
  },
];
