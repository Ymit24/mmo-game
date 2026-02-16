import { runAdminCommand } from "./admin/cli";
import { createApp } from "./app";
import { createRealtimeGateway } from "./game/realtime";

const DEFAULT_SERVER_PORT = 3001;
const MAX_SERVER_PORT = 65_535;

function resolveStartingPort(rawPort: string | undefined): number {
  if (!rawPort) {
    return DEFAULT_SERVER_PORT;
  }

  const parsedPort = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(parsedPort)) {
    return DEFAULT_SERVER_PORT;
  }

  if (parsedPort < 1 || parsedPort > MAX_SERVER_PORT) {
    return DEFAULT_SERVER_PORT;
  }

  return parsedPort;
}

function isPortInUseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { code } = error as { code?: unknown };
  return code === "EADDRINUSE";
}

const args = Bun.argv.slice(2);
if (args[0] === "admin") {
  const exitCode = await runAdminCommand(args);
  process.exit(exitCode);
}

const app = createApp();
const realtime = createRealtimeGateway(app.config, app.db);

const startingPort = resolveStartingPort(process.env.PORT);

let server: ReturnType<typeof Bun.serve> | null = null;
for (let port = startingPort; port <= MAX_SERVER_PORT; port += 1) {
  try {
    server = Bun.serve({
      fetch: (request, serverInstance) => {
        const upgradeResponse = realtime.onFetchUpgrade(
          request,
          serverInstance,
        );
        if (upgradeResponse) {
          return upgradeResponse;
        }

        return app.fetch(request);
      },
      port,
      websocket: realtime.handlers,
    });
    break;
  } catch (error) {
    if (isPortInUseError(error)) {
      continue;
    }

    throw error;
  }
}

if (!server) {
  throw new Error(
    `Unable to find an available port between ${startingPort} and ${MAX_SERVER_PORT}.`,
  );
}

console.log(`MMO server listening on http://localhost:${server.port}`);
