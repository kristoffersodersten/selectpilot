const ENABLE_LOG = true;

export function log(scope: string, ...args: unknown[]): void {
  if (!ENABLE_LOG) return;
  console.log(`[ChromeAI:${scope}]`, ...args);
}

export function warn(scope: string, ...args: unknown[]): void {
  if (!ENABLE_LOG) return;
  console.warn(`[ChromeAI:${scope}]`, ...args);
}

export function error(scope: string, ...args: unknown[]): void {
  console.error(`[ChromeAI:${scope}]`, ...args);
}
