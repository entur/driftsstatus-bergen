import { formatDistance } from 'date-fns';
import { nb } from 'date-fns/locale';

export function isStale(generatedAt, now, maxAgeMs = 15 * 60 * 1000) {
    return now.getTime() - new Date(generatedAt).getTime() > maxAgeMs;
}

const LABELS = {
    success: 'Deployet',
    failure: 'Deploy feilet',
    in_progress: 'Deployer …',
    unknown: 'Ukjent'
};
export function deployLabel(state) {
    return LABELS[state] ?? LABELS.unknown;
}

const COLORS = {
    success: 'success',
    in_progress: 'warning',
    failure: 'negative',
    unknown: 'neutral'
};
export function deployColorKey(state) {
    return COLORS[state] ?? 'neutral';
}

export function timeAgo(iso, now) {
    if (!iso) return '';
    return formatDistance(new Date(iso), now, { addSuffix: true, locale: nb });
}

const HEALTH_COLORS = {
    up: 'success',
    degraded: 'warning',
    down: 'negative',
    unknown: 'neutral'
};
export function healthColorKey(state) {
    return HEALTH_COLORS[state] ?? 'neutral';
}

const RANK = { neutral: 0, success: 1, warning: 2, negative: 3 };
const BY_RANK = ['neutral', 'success', 'warning', 'negative'];
export function combineSeverity(deployState, healthState) {
    const r = Math.max(RANK[deployColorKey(deployState)], RANK[healthColorKey(healthState)]);
    return BY_RANK[r];
}

export function formatMs(n) {
    if (n === null || n === undefined) return '–';
    return `${Math.round(n)} ms`;
}

export function formatPct(frac) {
    if (frac === null || frac === undefined) return '–';
    return `${(frac * 100).toFixed(1).replace('.', ',')} %`;
}

const ENV_STATE_LABELS = {
    in_progress: 'deployer …',
    failure: 'feilet',
    unknown: 'ingen data'
};
export function envStateLabel(state) {
    return ENV_STATE_LABELS[state] ?? '';
}

export function deployRef(env) {
    if (env.ticket) return env.ticket;
    if (env.pr) return `PR: ${env.pr}`;
    return '';
}