// module_name: utils_time_ts
// spec_ref: "frontend_state_contract"
// @spec_ref frontend_state_contract
export function nowISO(): string {
  return new Date().toISOString();
}

// @spec_ref frontend_state_contract
export function daysFrom(timestamp: number): number {
  const diff = Date.now() - timestamp;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// @spec_ref frontend_state_contract
export function readableTime(): string {
  return new Date().toLocaleString();
}
