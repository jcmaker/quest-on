import { execSync } from "child_process";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";
import {
  createTestSupabaseClient,
  waitForTestSupabaseReady,
} from "./helpers/supabase-test-client";

// Load test env vars
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

let mockServer: ChildProcess | null = null;

/**
 * Apply pending schema migrations to local Supabase.
 * Uses IF NOT EXISTS so it's safe to run repeatedly.
 */
async function applyMigrations() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("[global-setup] Missing Supabase env vars, skipping migrations");
    return;
  }

  console.log("[global-setup] Applying schema migrations...");
  await waitForTestSupabaseReady();
  const supabase = createTestSupabaseClient();

  // Migration: add chat_weight column if missing (sql/005_add_chat_weight.sql)
  try {
    const { error } = await supabase
      .from("exams")
      .select("chat_weight")
      .limit(0);

    if (error && error.message.includes("does not exist")) {
      console.log("[global-setup] Adding chat_weight column to exams table...");
      execSync(
        `docker exec -i supabase_db_quest-on-mvp psql -U postgres -d postgres -c "ALTER TABLE exams ADD COLUMN IF NOT EXISTS chat_weight INT DEFAULT 50;"`,
        { stdio: "pipe" }
      );
      console.log("[global-setup] chat_weight column added.");
    }
  } catch (err) {
    console.warn("[global-setup] chat_weight migration failed:", err);
  }

  // Ensure exam-materials storage bucket exists (for upload tests)
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === "exam-materials");

    if (!bucketExists) {
      console.log("[global-setup] Creating exam-materials storage bucket...");
      const { error } = await supabase.storage.createBucket("exam-materials", {
        public: true,
        fileSizeLimit: 26 * 1024 * 1024, // 26MB
      });
      if (error) {
        console.warn("[global-setup] Failed to create bucket:", error.message);
      } else {
        console.log("[global-setup] exam-materials bucket created.");
      }
    }
  } catch (err) {
    console.warn("[global-setup] Bucket setup failed:", err);
  }

  console.log("[global-setup] Migrations complete.");
}

async function globalSetup() {
  // Apply DB migrations first
  await applyMigrations();

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
