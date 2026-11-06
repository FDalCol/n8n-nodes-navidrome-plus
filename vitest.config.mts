import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
	resolve: {
		// Use the CommonJS build of n8n-workflow, as n8n does at runtime. Its ESM build
		// uses extensionless imports and ships sourcemaps without sources.
		alias: { 'n8n-workflow': require.resolve('n8n-workflow') },
	},
	test: {
		include: ['test/**/*.test.mts'],
	},
});
