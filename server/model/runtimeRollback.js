import fs from 'node:fs';
import path from 'node:path';
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const policyPath = path.resolve(repoRoot, 'runtime/model_policy.json');
const auditPath = path.resolve(repoRoot, 'runtime/promotion_audit.json');
const liveFeedbackPath = path.resolve(repoRoot, 'runtime/live_feedback.jsonl');
function readJson(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
}
function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
function appendAuditEvent(record) {
    const audit = readJson(auditPath) || {};
    const events = Array.isArray(audit.events) ? [...audit.events] : [];
    events.push(record);
    writeJson(auditPath, { ...audit, events });
    return 1;
}
function appendFeedback(record) {
    fs.mkdirSync(path.dirname(liveFeedbackPath), { recursive: true });
    fs.appendFileSync(liveFeedbackPath, `${JSON.stringify(record)}\n`, 'utf8');
}
export function performRuntimeRollback(reason = 'manual_runtime_rollback') {
    const policy = readJson(policyPath);
    if (!policy) {
        return {
            rollback_triggered: false,
            rolled_back_from: null,
            rolled_back_to: null,
            reason: 'policy_missing',
            policy: null,
            audit_events_appended: 0,
        };
    }
    const history = Array.isArray(policy.promotion_history) ? [...policy.promotion_history] : [];
    const last = history.at(-1);
    if (!last) {
        return {
            rollback_triggered: false,
            rolled_back_from: null,
            rolled_back_to: null,
            reason: 'no_promotion_history',
            policy,
            audit_events_appended: 0,
        };
    }
    const defaults = Array.isArray(policy.defaults) ? policy.defaults : [];
    const target = defaults.find((d) => d.task_family === last.task_family && d.hardware_profile === last.hardware_profile);
    if (!target) {
        return {
            rollback_triggered: false,
            rolled_back_from: null,
            rolled_back_to: null,
            reason: 'target_mapping_not_found',
            policy,
            audit_events_appended: 0,
        };
    }
    const rolledBackFrom = target.preferred_model_id;
    const fallbackRollbackTarget = (target.fallback_model_ids || []).find((id) => id && id !== rolledBackFrom) || null;
    const rolledBackTo = (last.previous_model_id && last.previous_model_id !== 'none') ? last.previous_model_id : fallbackRollbackTarget;
    if (!rolledBackTo) {
        return {
            rollback_triggered: false,
            rolled_back_from: rolledBackFrom || null,
            rolled_back_to: null,
            reason: 'no_valid_rollback_target',
            policy,
            audit_events_appended: 0,
        };
    }
    target.preferred_model_id = rolledBackTo;
    target.selection_reason = `rollback:${reason}`;
    target.effective_from_unix_ms = Date.now();
    target.fallback_model_ids = [rolledBackFrom, ...(target.fallback_model_ids || []).filter((id) => id !== rolledBackFrom && id !== rolledBackTo)].slice(0, 3);
    writeJson(policyPath, policy);
    const appended = appendAuditEvent({
        event_type: 'rollback',
        generated_at_unix_ms: Date.now(),
        rolled_back_from: rolledBackFrom,
        rolled_back_to: rolledBackTo,
        reason,
        task_family: last.task_family,
        hardware_profile: last.hardware_profile,
        policy_version: policy.policy_version,
    });
    appendFeedback({
        timestamp: new Date().toISOString(),
        type: 'rollback',
        reason,
        rolled_back_from: rolledBackFrom,
        rolled_back_to: rolledBackTo,
        policy_version: policy.policy_version,
    });
    return {
        rollback_triggered: true,
        rolled_back_from: rolledBackFrom,
        rolled_back_to: rolledBackTo,
        reason,
        policy,
        audit_events_appended: appended,
    };
}
