export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  payload?: unknown;
  path?: string;
  user_id?: string;
}

export async function insertLog(entry: LogEntry): Promise<boolean> {
  const prefix = `[${entry.level.toUpperCase()}]`;
  const detail = entry.payload !== undefined ? entry.payload : "";
  if (entry.level === "error") {
    console.error(prefix, entry.message, detail);
  } else if (entry.level === "warn") {
    console.warn(prefix, entry.message, detail);
  } else {
    console.log(prefix, entry.message, detail);
  }
  return true;
}

export async function logError(
  message: string,
  error?: unknown,
  options?: {
    path?: string;
    user_id?: string;
    additionalData?: Record<string, unknown>;
  }
): Promise<boolean> {
  let payload: Record<string, unknown> = {};

  if (error) {
    if (error instanceof Error) {
      payload = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...options?.additionalData,
      };
    } else if (typeof error === "object" && error !== null) {
      payload = {
        ...(error as Record<string, unknown>),
        ...options?.additionalData,
      };
    } else {
      payload = {
        error: String(error),
        ...options?.additionalData,
      };
    }
  } else if (options?.additionalData) {
    payload = options.additionalData;
  }

  return insertLog({
    level: "error",
    message,
    payload: Object.keys(payload).length > 0 ? payload : undefined,
    path: options?.path,
    user_id: options?.user_id,
  });
}

export async function logWarn(
  message: string,
  options?: {
    path?: string;
    user_id?: string;
    payload?: unknown;
  }
): Promise<boolean> {
  return insertLog({
    level: "warn",
    message,
    payload: options?.payload,
    path: options?.path,
    user_id: options?.user_id,
  });
}

export async function logInfo(
  message: string,
  options?: {
    path?: string;
    user_id?: string;
    payload?: unknown;
  }
): Promise<boolean> {
  return insertLog({
    level: "info",
    message,
    payload: options?.payload,
    path: options?.path,
    user_id: options?.user_id,
  });
}
