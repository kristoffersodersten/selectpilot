const state = {
    frontier: [],
    determinism: null,
    bottleneck: null,
};
// @spec_ref frontend_state_contract
export function loadFrontierReport(decisions) {
    state.frontier = Array.isArray(decisions) ? decisions : [];
    return state;
}
// @spec_ref frontend_state_contract
export function loadDeterminismReport(report) {
    state.determinism = report || null;
    return state;
}
// @spec_ref frontend_state_contract
export function loadBottleneckReport(analysis) {
    state.bottleneck = analysis || null;
    return state;
}
