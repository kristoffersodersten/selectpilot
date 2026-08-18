// module_name: utils_logger_ts
// spec_ref: "frontend_state_contract"
const ENABLE_LOG = true;

// @spec_ref frontend_state_contract
export function log(scope: string, ...args: unknown[]): void {
  if (!ENABLE_LOG) return;
  console.log(`[ChromeAI:${scope}]`, ...args);
}

// @spec_ref frontend_state_contract
export function warn(scope: string, ...args: unknown[]): void {
  if (!ENABLE_LOG) return;
  console.warn(`[ChromeAI:${scope}]`, ...args);
}

// @spec_ref frontend_state_contract
export function error(scope: string, ...args: unknown[]): void {
  console.error(`[ChromeAI:${scope}]`, ...args);
}
