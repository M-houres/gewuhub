import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

const host = process.env.HOSTNAME || "127.0.0.1";
const preferredPort = Number(process.env.PORT || 3000);

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function pickPort(startPort) {
  let port = startPort;
  while (!(await isPortFree(port))) {
    port += 1;
  }
  return port;
}

async function main() {
  const port = await pickPort(preferredPort);
  if (port !== preferredPort) {
    // eslint-disable-next-line no-console
    console.log(`[web] Port ${preferredPort} is occupied, switched to ${port}.`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[web] Using port ${port}.`);
  }

  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", host, "--port", String(port)], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
    },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

void main();
