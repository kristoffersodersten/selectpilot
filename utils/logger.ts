// module_name: utils_logger_ts
// spec_ref: "frontend_state_contract"
const ENABLE_DEBUG_LOG = false;

type SafeLogValue = string | number | boolean | null | undefined;

function safe(values: unknown[]): SafeLogValue[] {
  return values.map((value) => {
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string' && /^[a-z0-9_.:/-]{1,96}$/i.test(value)) return value;
    if (value instanceof Error) return value.name;
    return '[redacted]';
  });
}

// @spec_ref frontend_state_contract
export function log(scope: string, ...args: unknown[]): void {
  if (!ENABLE_DEBUG_LOG) return;
  console.log(`[SelectPilot:${scope}]`, ...safe(args));
}

// @spec_ref frontend_state_contract
export function warn(scope: string, ...args: unknown[]): void {
  if (!ENABLE_DEBUG_LOG) return;
  console.warn(`[SelectPilot:${scope}]`, ...safe(args));
}

// @spec_ref frontend_state_contract
export function error(scope: string, ...args: unknown[]): void {
  console.error(`[SelectPilot:${scope}]`, ...safe(args));
}
