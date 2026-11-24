import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

function inlinePublicHeroAssetsPlugin(): Plugin {
  const heroFiles = ['links.png', 'github.png', 'notes.png', 'hackathons.png'];
  return {
    name: 'inline-public-hero-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('constants/sections')) return null;
      let transformed = code;
      for (const file of heroFiles) {
        const filePath = path.resolve(import.meta.dirname, 'public/hero', file);
        if (fs.existsSync(filePath)) {
          const b64 = fs.readFileSync(filePath).toString('base64');
          const dataUri = `data:image/png;base64,${b64}`;
          transformed = transformed.replaceAll(`./hero/${file}`, dataUri);
        }
      }
      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  const isSingleFile =
    mode === 'singlefile' || process.env.SINGLEFILE === 'true';
  const target =
    process.env.VITE_TARGET ||
    (mode === 'electron' || mode === 'android' ? mode : 'web');
  const disablePwa =
    isSingleFile || target === 'electron' || target === 'android';
  return {
    base: './',
    build: isSingleFile
      ? {
          copyPublicDir: false,
          assetsInlineLimit: 100 * 1024 * 1024,
        }
      : undefined,
    plugins: [
      react(),
      tailwindcss(),
      ...(isSingleFile
        ? [inlinePublicHeroAssetsPlugin(), viteSingleFile()]
        : disablePwa
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              injectRegister: false,
              includeAssets: [
                'icon.svg',
                'apple-touch-icon.png',
                'pwa-192x192.png',
                'pwa-512x512.png',
                'pwa-maskable-512x512.png',
                'hero/links.png',
                'hero/github.png',
                'hero/notes.png',
                'hero/hackathons.png',
              ],
              manifest: {
                id: '/',
                name: 'Guardian Vault',
                short_name: 'Guardian',
                description:
                  'Encrypted personal vault for website links, GitHub repositories, markdown notes, and hackathons.',
                theme_color: '#F4845F',
                background_color: '#18181B',
                display: 'standalone',
                start_url: './',
                scope: './',
                icons: [
                  {
                    src: 'pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: 'pwa-maskable-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
                cleanupOutdatedCaches: true,
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
              },
              devOptions: {
                enabled: false,
              },
            }),
          ]),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
