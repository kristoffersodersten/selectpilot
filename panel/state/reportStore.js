const state = {
    frontier: [],
    determinism: null,
    bottleneck: null,
};
export function loadFrontierReport(decisions) {
    state.frontier = Array.isArray(decisions) ? decisions : [];
    return state;
}
export function loadDeterminismReport(report) {
    state.determinism = report || null;
    return state;
}
export function loadBottleneckReport(analysis) {
    state.bottleneck = analysis || null;
    return state;
}
