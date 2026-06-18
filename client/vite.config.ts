import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_DEV_CLIENT_PORT) || 3001,
      host: env.VITE_DEV_CLIENT_HOST || 'localhost',
      proxy: {
        // Proxy API requests to the server during development
        '/api': {
          target: 'http://localhost:3000', // Node Authorization Server 
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    preview: {
      port: parseInt(env.VITE_DEV_CLIENT_PORT) || 3001,
      host: env.VITE_DEV_CLIENT_HOST || 'localhost',
    },
  };
});
