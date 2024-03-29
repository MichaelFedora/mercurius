import { defineConfig } from 'vite';
import { createVuePlugin as vue } from 'vite-plugin-vue2';
import nodePolyfills from  'rollup-plugin-polyfill-node';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  plugins: [
    vue(),
    nodePolyfills()
  ],
  server: {
    port: 7171
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src')
      },
      {
        find: /^(?:readable-)?stream$/,
        replacement: 'vite-compatible-readable-stream'
      },
      {
        find: 'stream',
        replacement: 'vite-compatible-readable-stream'
      },
      {
        find: 'readable-stream',
        replacement: 'vite-compatible-readable-stream'
      }
    ]
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  }
});
