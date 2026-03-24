const ENABLE_LOG = true;
export function log(scope, ...args) {
    if (!ENABLE_LOG)
        return;
    console.log(`[ChromeAI:${scope}]`, ...args);
}
export function warn(scope, ...args) {
    if (!ENABLE_LOG)
        return;
    console.warn(`[ChromeAI:${scope}]`, ...args);
}
export function error(scope, ...args) {
    console.error(`[ChromeAI:${scope}]`, ...args);
}
