const RESOLVED_INCIDENT = new Set(['resolved', 'postmortem']);
const DONE_MAINTENANCE = new Set(['completed']);

export function utledOverall(messages) {
    if (messages.some((m) => m.kind === 'ongoing')) return 'red';
    if (messages.some((m) => m.kind === 'planned')) return 'yellow';
    return 'green';
}

export function parseStatusFeed(json) {
    if (!json || typeof json !== 'object') {
        return { messages: [], overall: 'green' };
    }
    const incidents = Array.isArray(json.incidents) ? json.incidents : [];
    const maintenances = Array.isArray(json.scheduled_maintenances) ? json.scheduled_maintenances : [];

    const messages = [];
    for (const inc of incidents) {
        if (!RESOLVED_INCIDENT.has(inc.status)) {
            messages.push({ title: inc.name ?? '', kind: 'ongoing' });
        }
    }
    for (const m of maintenances) {
        if (!DONE_MAINTENANCE.has(m.status)) {
            messages.push({ title: m.name ?? '', kind: 'planned' });
        }
    }
    return { messages, overall: utledOverall(messages) };
}

export async function fetchStatusFeed(url, fetchImpl = fetch) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`summary.json ${res.status}`);
    const data = await res.json();
    return parseStatusFeed(data);
}
