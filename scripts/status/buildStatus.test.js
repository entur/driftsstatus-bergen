import { describe, it, expect } from 'vitest';
import { buildStatusJson } from './buildStatus.js';
import { UNKNOWN_HEALTH } from './metrics.js';

const services = [
    { name: 'svc-a', repo: 'entur/svc-a', deployWorkflowNames: ['cd'], branch: 'main' },
    { name: 'svc-b', repo: 'entur/svc-b', deployWorkflowNames: ['cd'], branch: 'main' }
];

const okRun = [{ name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'abcdef1234', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/a' }];
const fetchRuns = (runsByRepo) => async (repo) => runsByRepo[repo] ?? [];
const healthUp = { state: 'up', up: true, p95Ms: 100, errorRate5xx: 0, errorRate4xx: 0 };

describe('buildStatusJson', () => {
    it('kombinerer deploy og helse per tjeneste', async () => {
        const fh = async (svc) => (svc.name === 'svc-a' ? healthUp : { ...UNKNOWN_HEALTH });
        const result = await buildStatusJson(services, fetchRuns({ 'entur/svc-a': okRun }), fh, '2026-07-24T09:00:00Z');
        expect(result.generatedAt).toBe('2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('success');
        expect(result.services[0].health).toEqual(healthUp);
        expect(result.services[1].health.state).toBe('unknown');
    });

    it('feilende fetchHealth degraderer til unknown health uten å velte tjenesten', async () => {
        const fh = async (svc) => { if (svc.name === 'svc-b') throw new Error('boom'); return healthUp; };
        const result = await buildStatusJson(services, fetchRuns({}), fh, '2026-07-24T09:00:00Z');
        expect(result.services[0].health).toEqual(healthUp);
        expect(result.services[1].health).toEqual(UNKNOWN_HEALTH);
    });

    it('feilende fetchRuns gir unknown deploy', async () => {
        const fh = async () => ({ ...UNKNOWN_HEALTH });
        const fr = async () => { throw new Error('gh'); };
        const result = await buildStatusJson(services, fr, fh, '2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('unknown');
    });
});
