import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { CONTENT_SECURITY_POLICY } from './config/csp.ts';

/**
 * Adds the CSP <meta> tag to the production HTML only. The dev server needs
 * a websocket for hot reload, which the strict policy would block.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'airwise:csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  base: './',
  plugins: [contentSecurityPolicy()],
  build: {
    target: 'es2022',
    cssMinify: true,
    // Keep the build free of inline <script> blocks so the CSP needs no hashes.
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/test-utils/**'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
