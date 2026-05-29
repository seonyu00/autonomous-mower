export function nextReconnectDelay(attempt: number, baseMs = 1000, maxMs = 10000) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
