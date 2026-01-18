import {defineConfig} from 'vite'
import {resolve} from 'path'

export default defineConfig({
    root: '.',
    base: './',
    build: {
        outDir: 'dist',
        target: 'es2020',
        sourcemap: true,
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'index.html'),
            output: {
                format: 'es',
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]'
            }
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@src': resolve(__dirname, 'src')
        }
    },
    server: {
        port: 3000,
        open: false
    },
    optimizeDeps: {
        include: ['jszip', 'i18next']
    },
    worker: {
        format: 'es',
        plugins: () => []
    }
})
