export function nowISO() {
    return new Date().toISOString();
}
export function daysFrom(timestamp) {
    const diff = Date.now() - timestamp;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}
export function readableTime() {
    return new Date().toLocaleString();
}
