import { createApp } from "./app";

const app = createApp();

const server = Bun.serve({
  fetch: app.fetch,
  port: Number.parseInt(process.env.PORT ?? "3001", 10),
});

console.log(`MMO server listening on http://localhost:${server.port}`);
