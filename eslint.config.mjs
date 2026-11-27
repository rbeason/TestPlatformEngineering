import js from '@eslint/js';

export default [
  {
    ignores: [
      '.astro/**',
      'dist/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
];
