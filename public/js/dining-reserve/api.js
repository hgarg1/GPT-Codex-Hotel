async function handleResponse(response) {
    if (!response.ok) {
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            const error = {
                status: response.status,
                message: data.error || 'Unexpected server error',
                field: data.field,
            };
            throw error;
        }
        catch (parseError) {
            throw { status: response.status, message: text || 'Unexpected server error' };
        }
    }
    return (await response.json());
}

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}

function buildHeaders(options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.json) {
        headers['Content-Type'] = 'application/json';
    }
    const csrf = getCsrfToken();
    if (csrf) {
        headers['X-CSRF-Token'] = csrf;
    }
    return headers;
}

export async function validateSchedule(date, time) {
    const response = await fetch('/api/dining/reservations/validate', {
        method: 'POST',
        headers: buildHeaders({ json: true }),
        credentials: 'include',
        body: JSON.stringify({ step: 'schedule', date, time }),
    });
    return handleResponse(response);
}
export async function validateParty(date, time, partySize) {
    const response = await fetch('/api/dining/reservations/validate', {
        method: 'POST',
        headers: buildHeaders({ json: true }),
        credentials: 'include',
        body: JSON.stringify({ step: 'party', date, time, partySize }),
    });
    return handleResponse(response);
}
export async function validateGuest(guest) {
    const response = await fetch('/api/dining/reservations/validate', {
        method: 'POST',
        headers: buildHeaders({ json: true }),
        credentials: 'include',
        body: JSON.stringify({ step: 'guest', guest }),
    });
    return handleResponse(response).then((data) => data.guest);
}
export async function fetchDiningTables() {
    const response = await fetch('/api/dining/tables', {
        credentials: 'include',
        headers: buildHeaders(),
    });
    return handleResponse(response);
}
export async function fetchAvailability(date, time, partySize) {
    const params = new URLSearchParams({ date, time, partySize: String(partySize) });
    const response = await fetch(`/api/dining/availability?${params.toString()}`, {
        credentials: 'include',
        headers: buildHeaders(),
    });
    return handleResponse(response);
}
export async function holdTables(date, time, tableIds) {
    const response = await fetch('/api/dining/hold', {
        method: 'POST',
        headers: buildHeaders({ json: true }),
        credentials: 'include',
        body: JSON.stringify({ date, time, tableIds }),
    });
    return handleResponse(response).then((data) => ({
        holdId: data.holdId,
        expiresAt: data.expiresAt,
        tableIds: [...tableIds],
    }));
}
export async function releaseHold(holdId) {
    await fetch('/api/dining/release', {
        method: 'POST',
        headers: buildHeaders({ json: true }),
        credentials: 'include',
        body: JSON.stringify({ holdId }),
    });
}
export async function submitReservation(payload) {
    const response = await fetch('/api/dining/reservations', {
        method: 'POST',
        headers: buildHeaders({ json: true }),
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    return handleResponse(response).then((data) => data.reservation);
}
