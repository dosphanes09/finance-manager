import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// This API has no authentication layer — it's built for a single local user.
// Binding with no host argument defaults to 0.0.0.0 (all network interfaces),
// which would let anyone on the same Wi-Fi/LAN read and modify every stored
// transaction with no login required. Bind to loopback only unless the
// deployer explicitly opts into wider access via HOST.
const host = process.env.HOST ?? "127.0.0.1";

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
});
