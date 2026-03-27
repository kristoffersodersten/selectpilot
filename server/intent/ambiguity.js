const KEYWORDS = {
    extract: ['extract', 'json', 'schema', 'fields', 'structured', 'pull out'],
    analyze: ['analyze', 'summarize', 'summary', 'explain', 'insight', 'compare'],
    classify: ['classify', 'categorize', 'label', 'tag'],
    transform: ['rewrite', 'transform', 'convert', 'rephrase', 'refactor'],
    generate: ['generate', 'create', 'draft', 'write', 'compose'],
    unknown: [],
};
const CONTRADICTION_PAIRS = [
    ['flat', 'spherical'],
    ['true', 'false'],
    ['always', 'never'],
];
function hasContradictorySignals(text) {
    return CONTRADICTION_PAIRS.some(([a, b]) => text.includes(a) && text.includes(b));
}
function looksLikeSimpleFactualStatement(text) {
    return /\bis\b/.test(text) && /[.!?]$/.test(text) && !hasContradictorySignals(text);
}
export function scoreIntentOperations(intentNormalized) {
    const text = String(intentNormalized || '').toLowerCase();
    const scores = {
        extract: 0,
        analyze: 0,
        classify: 0,
        transform: 0,
        generate: 0,
        unknown: 0,
    };
    for (const [family, words] of Object.entries(KEYWORDS)) {
        if (family === 'unknown')
            continue;
        for (const word of words) {
            if (text.includes(word)) {
                scores[family] += 1;
            }
        }
    }
    if (hasContradictorySignals(text)) {
        scores.analyze += 2;
        scores.unknown += 1;
    }
    const underspecifiedSummarizeLike = (text.includes('summarize') || text.includes('analyze') || text.includes('explain'))
        && /\b(this|that|it)\b/.test(text);
    if (underspecifiedSummarizeLike) {
        scores.unknown += 1;
    }
    const total = Object.entries(scores)
        .filter(([family]) => family !== 'unknown')
        .reduce((acc, [, value]) => acc + value, 0);
    if (total === 0) {
        if (looksLikeSimpleFactualStatement(text)) {
            scores.extract = 1;
        }
        else {
            scores.unknown = 1;
        }
    }
    return scores;
}
export function selectTopOperationFamily(scores) {
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [top] = ranked;
    if (!top || top[1] <= 0)
        return 'unknown';
    return top[0];
}
export function computeAmbiguityScore(scores) {
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = ranked[0]?.[1] ?? 0;
    const second = ranked[1]?.[1] ?? 0;
    if (top <= 0)
        return 1;
    if (top === second)
        return 1;
    const ratio = second / top;
    return Math.max(0, Math.min(1, Number(ratio.toFixed(4))));
}
export function needsIntentClarification(ambiguityScore, threshold = 0.4) {
    return Number(ambiguityScore) >= Number(threshold);
}
