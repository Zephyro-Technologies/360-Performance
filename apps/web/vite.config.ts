import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Internal workspace packages ship TS/TSX source — let Vite transpile them
  // (and let Tailwind's module-graph scan see their classes) rather than
  // pre-bundling them as opaque deps.
  optimizeDeps: {
    exclude: ['@360/ui', '@360/lib'],
  },

  // Split vendors into cacheable chunks; routes are lazy-loaded (see App.tsx).
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
