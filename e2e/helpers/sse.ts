export interface SSEEvent {
  event: string;
  data: unknown;
}

/**
 * Parse a raw SSE response body into structured events.
 * Handles `event: <name>\ndata: <json>\n\n` format.
 */
export function parseSSEEvents(body: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = body.split("\n\n").filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "message";
    let dataStr = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventName = line.slice("event: ".length).trim();
      } else if (line.startsWith("data: ")) {
        dataStr += line.slice("data: ".length);
      }
    }

    if (!dataStr) continue;

    try {
      events.push({ event: eventName, data: JSON.parse(dataStr) });
    } catch {
      events.push({ event: eventName, data: dataStr });
    }
  }

  return events;
}
