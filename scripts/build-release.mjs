import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('A fresh absolute output directory is required.');
// No project config, dotenv, public directory, source maps, or local preview media.
await build({
  configFile: false, root: process.cwd(), envDir: false, envPrefix: [],
  publicDir: false, mode: 'production', plugins: [react()],
  build: { outDir: resolve(output), emptyOutDir: true, manifest: true, sourcemap: false, assetsInlineLimit: 0 },
});
