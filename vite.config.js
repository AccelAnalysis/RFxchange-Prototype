import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/RFxchange-Prototype/' : '/',
  build: {
    sourcemap: true,
  },
}));
