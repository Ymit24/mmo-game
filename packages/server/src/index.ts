import { runAdminCommand } from "./admin/cli";
import { createApp } from "./app";
import { createRealtimeGateway } from "./game/realtime";

const args = Bun.argv.slice(2);
if (args[0] === "admin") {
  const exitCode = await runAdminCommand(args);
  process.exit(exitCode);
}

const app = createApp();
const realtime = createRealtimeGateway(app.config, app.db);

const server = Bun.serve({
  fetch: (request, serverInstance) => {
    const upgradeResponse = realtime.onFetchUpgrade(request, serverInstance);
    if (upgradeResponse) {
      return upgradeResponse;
    }

    return app.fetch(request);
  },
  port: Number.parseInt(process.env.PORT ?? "3001", 10),
  websocket: realtime.handlers,
});

console.log(`MMO server listening on http://localhost:${server.port}`);
