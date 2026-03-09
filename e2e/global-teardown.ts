import { execSync } from "child_process";

const MOCK_SERVER_PORT = 4010;

async function globalTeardown() {
  const pid = process.env.__MOCK_SERVER_PID;
  if (pid) {
    console.log(`[global-teardown] Stopping mock server (PID: ${pid})...`);
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Already stopped
    }
  }

  // Fallback: kill any process still listening on the mock server port
  try {
    const portPid = execSync(`lsof -ti :${MOCK_SERVER_PORT}`, { encoding: "utf-8" }).trim();
    if (portPid) {
      console.log(`[global-teardown] Killing leftover process on port ${MOCK_SERVER_PORT} (PID: ${portPid})`);
      execSync(`kill -9 ${portPid}`, { stdio: "pipe" });
    }
  } catch {
    // No process on port — clean
  }

  console.log("[global-teardown] Done.");
}

export default globalTeardown;
