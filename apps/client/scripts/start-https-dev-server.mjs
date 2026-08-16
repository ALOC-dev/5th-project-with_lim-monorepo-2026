import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const certificateDirectory = resolve(clientRoot, ".cert");
const certificatePath = resolve(certificateDirectory, "dev-cert.pem");
const keyPath = resolve(certificateDirectory, "dev-key.pem");

const networkAddresses = Object.values(networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter(({ family, internal }) => family === "IPv4" && !internal)
  .map(({ address }) => address);

const certificateHosts = [...new Set(["localhost", "127.0.0.1", "::1", ...networkAddresses])];

mkdirSync(certificateDirectory, { recursive: true });

try {
  execFileSync(
    "mkcert",
    ["-cert-file", certificatePath, "-key-file", keyPath, ...certificateHosts],
    {
      cwd: clientRoot,
      stdio: "inherit",
    },
  );
} catch {
  console.error(
    "HTTPS development requires mkcert. Install it, run `mkcert -install`, and try again.",
  );
  process.exit(1);
}

const viteProcess = spawn(
  "pnpm",
  ["exec", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"],
  {
    cwd: clientRoot,
    env: {
      ...process.env,
      ALOC_DEV_HTTPS_CERT: certificatePath,
      ALOC_DEV_HTTPS_KEY: keyPath,
    },
    stdio: "inherit",
  },
);

viteProcess.on("error", (error) => {
  console.error("Failed to start the HTTPS development server.", error);
  process.exit(1);
});

viteProcess.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
