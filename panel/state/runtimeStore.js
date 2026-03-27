const MAX_VISIBLE_PANELS = 3;
const state = {
    intent: '',
    selectionContext: {
        selectionOrigin: 'unknown',
        contentLength: 0,
        executionBoundary: 'local',
        privacyMode: 'local-only',
    },
    runtimeHeader: {
        taskFamily: 'agent',
        selectedModel: 'unknown',
        selectionPath: 'baseline_selector',
        executionGeography: 'local',
        policyVersion: null,
    },
    steps: [],
    visiblePanels: ['selection_surface', 'runtime_surface', 'report_surface'],
};
export function setIntent(intent) {
    state.intent = String(intent || '');
    return state;
}
export function setSelectionContext(input) {
    state.selectionContext = {
        ...state.selectionContext,
        ...input,
    };
    return state;
}
export function applyRuntimeEvent(event) {
    state.runtimeHeader = {
        taskFamily: event.taskFamily || state.runtimeHeader.taskFamily,
        selectedModel: event.selectedModel || state.runtimeHeader.selectedModel,
        selectionPath: event.selectionPath || state.runtimeHeader.selectionPath,
        executionGeography: event.executionGeography || state.runtimeHeader.executionGeography,
        policyVersion: event.policyVersion ?? state.runtimeHeader.policyVersion,
    };
    if (event.step) {
        const idx = state.steps.findIndex((s) => s.id === event.step?.id);
        if (idx >= 0)
            state.steps[idx] = event.step;
        else
            state.steps.push(event.step);
    }
    return state;
}
export function setVisiblePanels(panels) {
    state.visiblePanels = [...panels].slice(0, MAX_VISIBLE_PANELS);
    return state;
}
