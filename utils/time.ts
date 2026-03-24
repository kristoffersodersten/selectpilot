export function nowISO(): string {
  return new Date().toISOString();
}

export function daysFrom(timestamp: number): number {
  const diff = Date.now() - timestamp;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function readableTime(): string {
  return new Date().toLocaleString();
}
