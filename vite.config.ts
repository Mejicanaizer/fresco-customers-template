import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createGateway, deploymentFromEnv, publicConfigPath } from './server/gateway';
import { serveApi } from './server/node-handler';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), {
      name: 'storefront-api',
      configureServer(server) {
        // Deployment settings are runtime input, never a prerequisite for building assets.
        const deployment = deploymentFromEnv({ ...loadEnv(mode, process.cwd(), 'STOREFRONT_'), ...process.env });
        const gateway = createGateway(deployment);
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/api/') && req.url?.split('?')[0] !== publicConfigPath) return next();
          // No binding yields a visible 503. There is no production/demo fallback.
          void serveApi(req, res, deployment?.publicOrigin ?? 'http://127.0.0.1:5373', gateway);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 5373, strictPort: true },
  };
});
