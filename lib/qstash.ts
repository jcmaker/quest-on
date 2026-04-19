import { Client } from "@upstash/qstash";

/**
 * QStash client for durable background job queueing.
 *
 * Used to enqueue `autoGradeSession` calls so that grading survives
 * serverless instance restarts and gets automatic retry on 5xx.
 *
 * Returns null in dev/test when QSTASH_TOKEN is not configured —
 * callers fall back to in-process fire-and-forget execution.
 */
let cachedClient: Client | null | undefined = undefined;

export function getQStash(): Client | null {
  if (cachedClient !== undefined) return cachedClient;

  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    cachedClient = null;
    return null;
  }

  cachedClient = new Client({ token });
  return cachedClient;
}

/**
 * Returns true when QStash is configured and should be used for queueing.
 */
export function isQStashEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN;
}

/**
 * Resolves the base URL the QStash worker should POST back to.
 * In production, VERCEL_URL or NEXT_PUBLIC_APP_URL; for local dev,
 * QSTASH_WORKER_BASE_URL (e.g. ngrok tunnel) is required.
 */
export function getWorkerBaseUrl(): string | null {
  const explicit = process.env.QSTASH_WORKER_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl.replace(/\/$/, "");

  return null;
}
