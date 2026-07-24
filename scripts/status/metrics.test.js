import { describe, it, expect } from 'vitest';
import { buildQueries, parseInstantVector, computeHealth, WARN_5XX, CRIT_5XX, UNKNOWN_HEALTH, fetchMetrics } from './metrics.js';

const svc = {
    name: 'products-api',
    metricsProject: 'ent-products-prd',
    metricsSelector: { namespace: 'products' }
};

describe('buildQueries', () => {
    const q = buildQueries(svc);
    it('bygger up-query fra selector', () => {
        expect(q.up).toBe('sum(up{namespace="products"})');
    });
    it('bygger p95 i ms fra histogram_quantile', () => {
        expect(q.p95).toBe('histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{namespace="products"}[15m]))) * 1000');
    });
    it('bygger 5xx/4xx/total med status-filter', () => {
        expect(q.fivexx).toBe('sum(rate(http_server_requests_seconds_count{namespace="products",status=~"5.."}[15m]))');
        expect(q.fourxx).toBe('sum(rate(http_server_requests_seconds_count{namespace="products",status=~"4.."}[15m]))');
        expect(q.total).toBe('sum(rate(http_server_requests_seconds_count{namespace="products"}[15m]))');
    });
    it('respekterer navn-overrides', () => {
        const q2 = buildQueries({ ...svc, requestCountMetric: 'http_requests_total', latencyBucketMetric: 'http_latency_bucket' });
        expect(q2.total).toBe('sum(rate(http_requests_total{namespace="products"}[15m]))');
        expect(q2.p95).toContain('http_latency_bucket');
    });
});

describe('parseInstantVector', () => {
    it('henter første verdi som tall', () => {
        const json = { status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [1700000000, '142.5'] }] } };
        expect(parseInstantVector(json)).toBe(142.5);
    });
    it('returnerer null for tomt result', () => {
        expect(parseInstantVector({ status: 'success', data: { resultType: 'vector', result: [] } })).toBeNull();
    });
    it('returnerer null for malformert svar', () => {
        expect(parseInstantVector({})).toBeNull();
        expect(parseInstantVector({ data: { result: [{ value: [1, 'NaN'] }] } })).toBeNull();
    });
});

describe('computeHealth', () => {
    const t = { warn: WARN_5XX, crit: CRIT_5XX };
    it('up når feilrate lav', () => {
        const h = computeHealth({ up: true, p95Ms: 120, fivexx: 0.001, fourxx: 0.02, total: 10 }, t);
        expect(h.state).toBe('up');
        expect(h.errorRate5xx).toBeCloseTo(0.0001);
        expect(h.errorRate4xx).toBeCloseTo(0.002);
        expect(h.p95Ms).toBe(120);
    });
    it('degraded når 5xx over warn', () => {
        expect(computeHealth({ up: true, p95Ms: 100, fivexx: 0.2, fourxx: 0, total: 10 }, t).state).toBe('degraded');
    });
    it('down når 5xx over crit', () => {
        expect(computeHealth({ up: true, p95Ms: 100, fivexx: 0.6, fourxx: 0, total: 10 }, t).state).toBe('down');
    });
    it('down når up=false uansett feilrate', () => {
        expect(computeHealth({ up: false, p95Ms: null, fivexx: 0, fourxx: 0, total: 10 }, t).state).toBe('down');
    });
    it('null trafikk gir null feilrater, state fra up', () => {
        const h = computeHealth({ up: true, p95Ms: null, fivexx: 0, fourxx: 0, total: 0 }, t);
        expect(h.errorRate5xx).toBeNull();
        expect(h.errorRate4xx).toBeNull();
        expect(h.state).toBe('up');
    });
    it('unknown når ingen data', () => {
        expect(computeHealth({ up: null, p95Ms: null, fivexx: null, fourxx: null, total: null }, t).state).toBe('unknown');
    });
});

describe('fetchMetrics', () => {
    const svc = { name: 'a', metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products' } };
    const vec = (v) => ({ status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [1, String(v)] }] } });

    it('samler helse fra fem queries', async () => {
        const queryFn = async (_project, promql) => {
            if (promql.includes('up{')) return vec(2);
            if (promql.includes('histogram_quantile')) return vec(150);
            if (promql.includes('status=~"5..')) return vec(0.05);
            if (promql.includes('status=~"4..')) return vec(0.1);
            return vec(10); // total
        };
        const h = await fetchMetrics(svc, queryFn);
        expect(h.up).toBe(true);
        expect(h.p95Ms).toBe(150);
        expect(h.errorRate5xx).toBeCloseTo(0.005);
        expect(h.errorRate4xx).toBeCloseTo(0.01);
        expect(h.state).toBe('up');
    });

    it('en feilende query gir null for det feltet, ikke krasj', async () => {
        const queryFn = async (_project, promql) => {
            if (promql.includes('histogram_quantile')) throw new Error('boom');
            if (promql.includes('up{')) return vec(1);
            return vec(0); // rates + total 0
        };
        const h = await fetchMetrics(svc, queryFn);
        expect(h.p95Ms).toBeNull();
        expect(h.up).toBe(true);
    });

    it('up=0 gir up=false', async () => {
        const h = await fetchMetrics(svc, async () => vec(0));
        expect(h.up).toBe(false);
    });
});
