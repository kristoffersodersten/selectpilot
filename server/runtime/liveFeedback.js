import fs from 'node:fs';
import path from 'node:path';
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const feedbackPath = path.resolve(repoRoot, 'runtime/live_feedback.jsonl');
export function appendRuntimeFeedback(record) {
    fs.mkdirSync(path.dirname(feedbackPath), { recursive: true });
    const payload = {
        timestamp: record.timestamp || new Date().toISOString(),
        runtime_selection_result: record.runtime_selection_result || null,
        validation_result: record.validation_result || null,
        execution_result: record.execution_result || null,
    };
    fs.appendFileSync(feedbackPath, `${JSON.stringify(payload)}\n`, 'utf8');
}
