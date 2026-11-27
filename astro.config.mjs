import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import process from 'node:process';
import { studioAgent } from './scripts/studio-agent.mjs';

export default defineConfig({
  vite: {
    plugins: [
      tailwind(),
      ...(process.env.STUDIO_AGENT === '1' ? [studioAgent()] : []),
    ],
  },
});
