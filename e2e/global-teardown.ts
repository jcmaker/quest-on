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
  console.log("[global-teardown] Done.");
}

export default globalTeardown;
