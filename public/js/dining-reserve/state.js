const STORAGE_KEY = 'dining.reserve.state.v1';
const defaultGuest = {
    phone: '',
    email: '',
    dietary: '',
    allergies: '',
    notes: '',
};
const defaultState = {
    step: 'schedule',
    date: null,
    time: null,
    partySize: null,
    selectedTableIds: [],
    tables: [],
    availability: null,
    hold: null,
    guest: { ...defaultGuest },
    confirmation: null,
};
function cloneState(state) {
    return {
        ...state,
        selectedTableIds: [...state.selectedTableIds],
        tables: [...state.tables],
        availability: state.availability ? { ...state.availability, suggestedCombos: state.availability.suggestedCombos.map((combo) => [...combo]), availableTableIds: [...state.availability.availableTableIds] } : null,
        hold: state.hold ? { ...state.hold, tableIds: [...state.hold.tableIds] } : null,
        guest: { ...state.guest },
        confirmation: state.confirmation ? { ...state.confirmation, tables: state.confirmation.tables.map((table) => ({ ...table })) } : null,
    };
}
export function loadState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return cloneState(defaultState);
        }
        const parsed = JSON.parse(raw);
        return {
            ...cloneState(defaultState),
            ...parsed,
            selectedTableIds: parsed.selectedTableIds ? [...parsed.selectedTableIds] : [],
            tables: parsed.tables ? [...parsed.tables] : [],
            availability: parsed.availability
                ? {
                    availableTableIds: [...parsed.availability.availableTableIds],
                    suggestedCombos: parsed.availability.suggestedCombos.map((combo) => [...combo]),
                }
                : null,
            hold: parsed.hold
                ? {
                    ...parsed.hold,
                    tableIds: [...parsed.hold.tableIds],
                }
                : null,
            guest: parsed.guest ? { ...defaultGuest, ...parsed.guest } : { ...defaultGuest },
            confirmation: parsed.confirmation
                ? {
                    ...parsed.confirmation,
                    tables: parsed.confirmation.tables.map((table) => ({ ...table })),
                }
                : null,
        };
    }
    catch (error) {
        console.warn('Failed to restore dining reserve state', error);
        return cloneState(defaultState);
    }
}
export function saveState(state) {
    try {
        const payload = cloneState(state);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    catch (error) {
        console.warn('Failed to persist dining reserve state', error);
    }
}
export function resetState() {
    sessionStorage.removeItem(STORAGE_KEY);
    return cloneState(defaultState);
}
export function updateStep(state, step) {
    const next = cloneState(state);
    next.step = step;
    next.confirmation = step === 'confirmation' ? next.confirmation : null;
    return next;
}
export function setSchedule(state, date, time) {
    const next = cloneState(state);
    next.date = date;
    next.time = time;
    next.step = 'party';
    next.selectedTableIds = [];
    next.hold = null;
    next.confirmation = null;
    return next;
}
export function setPartySize(state, partySize, availability) {
    const next = cloneState(state);
    next.partySize = partySize;
    next.availability = availability;
    next.step = 'seats';
    next.selectedTableIds = [];
    next.hold = null;
    next.confirmation = null;
    return next;
}
export function setTables(state, tables) {
    const next = cloneState(state);
    next.tables = tables;
    return next;
}
export function setSelectedTables(state, tableIds) {
    const next = cloneState(state);
    next.selectedTableIds = [...tableIds];
    return next;
}
export function setHold(state, hold) {
    const next = cloneState(state);
    next.hold = hold ? { ...hold, tableIds: [...hold.tableIds] } : null;
    return next;
}
export function setGuestDetails(state, guest) {
    const next = cloneState(state);
    next.guest = { ...guest };
    next.step = 'review';
    return next;
}
export function setConfirmation(state, confirmation) {
    const next = cloneState(state);
    next.confirmation = { ...confirmation, tables: confirmation.tables.map((table) => ({ ...table })) };
    next.step = 'confirmation';
    return next;
}
