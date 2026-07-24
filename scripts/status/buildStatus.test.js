import { describe, it, expect } from 'vitest';
import { buildStatusJson } from './buildStatus.js';

const services = [
    { name: 'svc-a', repo: 'entur/svc-a', deployWorkflowNames: ['cd'], branch: 'main' },
    { name: 'svc-b', repo: 'entur/svc-b', deployWorkflowNames: ['cd'], branch: 'main' }
];

function fakeFetchRuns(runsByRepo) {
    return async (repo) => runsByRepo[repo] ?? [];
}

describe('buildStatusJson', () => {
    it('bygger status for alle tjenester med injisert tidspunkt', async () => {
        const runs = {
            'entur/svc-a': [{ name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'abcdef1234', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/a' }]
        };
        const result = await buildStatusJson(services, fakeFetchRuns(runs), '2026-07-24T09:00:00Z');
        expect(result.generatedAt).toBe('2026-07-24T09:00:00Z');
        expect(result.services).toHaveLength(2);
        expect(result.services[0]).toEqual({
            name: 'svc-a',
            repo: 'entur/svc-a',
            deploy: { state: 'success', sha: 'abcdef1', at: '2026-07-24T08:00:00Z', url: 'https://x/a', version: null },
            health: { state: 'unknown', errorRate: null, p95Ms: null }
        });
    });
    it('gir unknown-deploy når et repo ikke har matchende runs', async () => {
        const result = await buildStatusJson(services, fakeFetchRuns({}), '2026-07-24T09:00:00Z');
        expect(result.services[1].deploy.state).toBe('unknown');
        expect(result.services[1].health.state).toBe('unknown');
    });
    it('lar en feilende fetch for én tjeneste gi unknown uten å velte resten', async () => {
        const fetchRuns = async (repo) => {
            if (repo === 'entur/svc-b') throw new Error('boom');
            return [{ name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'abcdef1234', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/a' }];
        };
        const result = await buildStatusJson(services, fetchRuns, '2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('success');
        expect(result.services[1].deploy.state).toBe('unknown');
    });
});
