export const WARN_5XX = 0.01;
export const CRIT_5XX = 0.05;

export const UNKNOWN_HEALTH = {
    state: 'unknown',
    up: null,
    p95Ms: null,
    errorRate5xx: null,
    errorRate4xx: null
};

function selectorString(labels) {
    return Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
}

export function buildQueries(service) {
    const sel = selectorString(service.metricsSelector);
    const count = service.requestCountMetric || 'http_server_requests_seconds_count';
    const bucket = service.latencyBucketMetric || 'http_server_requests_seconds_bucket';
    return {
        up: `sum(up{${sel}})`,
        p95: `histogram_quantile(0.95, sum by (le) (rate(${bucket}{${sel}}[15m]))) * 1000`,
        fivexx: `sum(rate(${count}{${sel},status=~"5.."}[15m]))`,
        fourxx: `sum(rate(${count}{${sel},status=~"4.."}[15m]))`,
        total: `sum(rate(${count}{${sel}}[15m]))`
    };
}

export function parseInstantVector(json) {
    const result = json?.data?.result;
    if (!Array.isArray(result) || result.length === 0) return null;
    const raw = result[0]?.value?.[1];
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
}

export function computeHealth({ up, p95Ms, fivexx, fourxx, total }, { warn, crit }) {
    const errorRate5xx = total > 0 && fivexx !== null ? fivexx / total : null;
    const errorRate4xx = total > 0 && fourxx !== null ? fourxx / total : null;

    let state;
    if (up === null && errorRate5xx === null && p95Ms === null) {
        state = 'unknown';
    } else if (up === false || (errorRate5xx !== null && errorRate5xx > crit)) {
        state = 'down';
    } else if (errorRate5xx !== null && errorRate5xx > warn) {
        state = 'degraded';
    } else {
        state = 'up';
    }
    return { state, up, p95Ms, errorRate5xx, errorRate4xx };
}
