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
