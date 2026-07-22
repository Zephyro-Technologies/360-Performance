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
    // Force a single React instance. @360/ui is excluded from dep-optimization (below), so its
    // Radix deps get pre-bundled separately and, without this, Vite can hand them a second copy of
    // React — which surfaces as "Invalid hook call / useState of null" the moment a Radix hook runs.
    dedupe: ['react', 'react-dom'],
  },

  // Internal workspace packages ship TS/TSX source — let Vite transpile them
  // (and let Tailwind's module-graph scan see their classes) rather than
  // pre-bundling them as opaque deps.
  optimizeDeps: {
    exclude: ['@360/ui', '@360/lib'],
  },

  // Split heavy vendors into their own cacheable chunks; routes are lazy-loaded
  // (see routes.tsx) so recharts/react-dnd only load when their page is opened.
  // Vite 8 / Rolldown dropped the object form of manualChunks — the function form works on both
  // bundlers. The greedy match resolves the real package name even through pnpm's nested
  // node_modules (…/.pnpm/recharts@3/node_modules/recharts/…).
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const m = id.replace(/\\/g, '/').match(/.*\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//)
          if (!m) return undefined
          const pkg = m[1]
          if (['react', 'react-dom', 'react-router', 'scheduler'].includes(pkg)) return 'react'
          if (pkg === 'recharts') return 'charts'
          if (pkg === 'react-dnd' || pkg === 'react-dnd-html5-backend') return 'dnd'
          if (pkg.startsWith('@tanstack/')) return 'query'
          if (pkg.startsWith('@supabase/')) return 'supabase'
          return undefined
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
