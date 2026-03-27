export function resolveIntent(intentRaw) {
    const raw = String(intentRaw ?? '');
    const normalized = raw
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim()
        .replace(/[\t ]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n');
    if (!normalized) {
        throw new Error('intent_empty_after_normalization');
    }
    return {
        intent_raw: raw,
        intent_normalized: normalized,
    };
}
