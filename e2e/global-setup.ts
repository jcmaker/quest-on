import { execSync } from "child_process";
import { ChildProcess, spawn } from "child_process";
import path from "path";

let mockServer: ChildProcess | null = null;

async function globalSetup() {
  console.log("\n[global-setup] Starting mock server...");

  // Start the OpenAI mock server
  mockServer = spawn("npx", ["tsx", "scripts/start-mock-server.ts"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "test" },
  });

  // Wait for mock server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Mock server failed to start within 10s"));
    }, 10_000);

    mockServer!.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("Mock server listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    mockServer!.stderr?.on("data", (data: Buffer) => {
      console.error(`[mock-server stderr] ${data.toString()}`);
    });

    mockServer!.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  console.log("[global-setup] Mock server ready.");

  // Store PID for teardown
  process.env.__MOCK_SERVER_PID = String(mockServer.pid);
}

export default globalSetup;
