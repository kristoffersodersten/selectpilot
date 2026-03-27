import { resolveIntent } from './resolveIntent.js';
import { computeAmbiguityScore, needsIntentClarification, scoreIntentOperations, selectTopOperationFamily, } from './ambiguity.js';
function inferOutputFormat(text, family) {
    const normalized = text.toLowerCase();
    if (normalized.includes('json') || normalized.includes('schema'))
        return 'json';
    if (family === 'extract' || family === 'classify')
        return 'structured';
    if (family === 'unknown')
        return 'unknown';
    return 'freeform';
}
function inferStrictness(text) {
    const normalized = text.toLowerCase();
    if (normalized.includes('strict') || normalized.includes('exact') || normalized.includes('must'))
        return 'high';
    if (normalized.includes('rough') || normalized.includes('quick'))
        return 'low';
    return 'medium';
}
function inferLength(text) {
    const normalized = text.toLowerCase();
    if (normalized.includes('one line') || normalized.includes('brief') || normalized.includes('short'))
        return 'short';
    if (normalized.includes('detailed') || normalized.includes('long'))
        return 'long';
    return 'medium';
}
function inferAction(family) {
    switch (family) {
        case 'extract':
            return 'extract_entities';
        case 'analyze':
            return 'analyze_context';
        case 'classify':
            return 'classify_input';
        case 'transform':
            return 'transform_text';
        case 'generate':
            return 'generate_output';
        default:
            return 'clarify_intent';
    }
}
function inferTarget(text) {
    const normalized = text.toLowerCase();
    if (normalized.includes('selection'))
        return 'selection';
    if (normalized.includes('page'))
        return 'page_text';
    if (normalized.includes('article'))
        return 'article';
    if (normalized.includes('email'))
        return 'email';
    return null;
}
function buildClarification(compiledIntent) {
    if (!compiledIntent.needs_clarification)
        return null;
    return {
        question: 'Your intent is ambiguous. What should SelectPilot do?',
        options: [
            'Extract structured data',
            'Summarize and analyze',
            'Transform or rewrite text',
            'Generate a new response',
        ],
    };
}
export function compileIntent(intentRaw) {
    const resolved = resolveIntent(intentRaw);
    const scores = scoreIntentOperations(resolved.intent_normalized);
    const operationFamily = selectTopOperationFamily(scores);
    const ambiguityScore = computeAmbiguityScore(scores);
    const needsClarification = needsIntentClarification(ambiguityScore);
    const constraints = {
        output_format: inferOutputFormat(resolved.intent_normalized, operationFamily),
        strictness: inferStrictness(resolved.intent_normalized),
        tone: null,
        length: inferLength(resolved.intent_normalized),
        schema_requested: resolved.intent_normalized.toLowerCase().includes('schema'),
        explanation_allowed: !resolved.intent_normalized.toLowerCase().includes('only output'),
    };
    const compiledIntent = {
        intent_raw: resolved.intent_raw,
        intent_normalized: resolved.intent_normalized,
        operation_family: operationFamily,
        action: inferAction(operationFamily),
        target: inferTarget(resolved.intent_normalized),
        constraints,
        ambiguity_score: ambiguityScore,
        needs_clarification: operationFamily === 'unknown' || needsClarification,
    };
    return {
        compiled_intent: compiledIntent,
        clarification: buildClarification(compiledIntent),
    };
}
