import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest uses Vite’s transform pipeline. `unplugin-swc` runs SWC instead of esbuild.
 *
 * Important: with `tsconfigFile: false`, unplugin-swc does **not** read `experimentalDecorators` /
 * `emitDecoratorMetadata` from `tsconfig.json` — it starts from an empty `compilerOptions` and would
 * omit `jsc.parser.decorators` unless we set `jsc` ourselves. The same `jsc` block is stored in
 * `.swcrc` for a single documented source of truth and for running `@swc/core` outside Vite.
 *
 * Nest DI in tests needs SWC to emit `design:paramtypes` (`jsc.transform.decoratorMetadata: true`) and
 * legacy decorators (`legacyDecorator: true`). `import 'reflect-metadata'` in `vitest.setup.ts` only
 * supplies the runtime reader for that metadata; it does not generate it.
 */
const swcJscForNestTests = {
  parser: {
    syntax: 'typescript' as const,
    decorators: true,
  },
  transform: {
    legacyDecorator: true,
    decoratorMetadata: true,
  },
  target: 'es2021' as const,
  keepClassNames: true,
};

export default defineConfig({
  plugins: [
    swc.vite({
      tsconfigFile: false,
      jsc: swcJscForNestTests,
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'migrations/**/*.test.ts',
      'test/**/*.e2e-spec.ts',
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
