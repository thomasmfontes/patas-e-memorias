import { createServer } from 'vite';

async function start() {
  const server = await createServer({
    root: process.cwd(),
    server: {
      port: 5173,
      host: '0.0.0.0'
    }
  });
  await server.listen();
  server.printUrls();
}

start().catch(err => {
  console.error('Failed to start Vite server:', err);
  process.exit(1);
});
