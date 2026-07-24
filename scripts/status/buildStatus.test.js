import { describe, it, expect } from 'vitest';
import { buildStatusJson } from './buildStatus.js';

const services = [
    { name: 'svc-a', repo: 'entur/svc-a', environments: ['dev', 'tst', 'prd'] },
    { name: 'svc-b', repo: 'entur/svc-b', environments: ['dev', 'tst', 'prd'] }
];

const deployFetchers = {
    listDeployments: async (repo) => repo === 'entur/svc-a'
        ? [{ id: 1, sha: 'abcdef1234', created_at: '2026-07-24T08:00:00Z' }]
        : [],
    getStatus: async () => ({ state: 'success', at: '2026-07-24T08:05:00Z', url: 'https://x/log' }),
    getCommitMessage: async () => 'feat: noe (ETU-1) (#9)'
};

const fetchHealthOk = async () => ({ state: 'up', up: true, p95Ms: 100, errorRate5xx: 0, errorRate4xx: 0 });

describe('buildStatusJson', () => {
    it('bygger per-miljø-deploy og beholder helse for alle tjenester', async () => {
        const result = await buildStatusJson(services, deployFetchers, fetchHealthOk, '2026-07-24T09:00:00Z');
        expect(result.generatedAt).toBe('2026-07-24T09:00:00Z');
        expect(result.services).toHaveLength(2);

        const a = result.services[0];
        expect(a.name).toBe('svc-a');
        expect(a.deploy.state).toBe('success');
        expect(a.deploy.environments.map((e) => e.env)).toEqual(['prd', 'tst', 'dev']);
        expect(a.deploy.environments[0]).toMatchObject({ env: 'prd', state: 'success', sha: 'abcdef1', ticket: 'ETU-1', pr: 9 });
        expect(a.health).toEqual({ state: 'up', up: true, p95Ms: 100, errorRate5xx: 0, errorRate4xx: 0 });
    });

    it('gir unknown-deploy for tjeneste uten deployments', async () => {
        const result = await buildStatusJson(services, deployFetchers, fetchHealthOk, '2026-07-24T09:00:00Z');
        const b = result.services[1];
        expect(b.deploy.state).toBe('unknown');
        expect(b.deploy.environments.every((e) => e.state === 'unknown')).toBe(true);
    });

    it('gir unknown-helse når fetchHealth kaster', async () => {
        const failingHealth = async () => { throw new Error('boom'); };
        const result = await buildStatusJson(services, deployFetchers, failingHealth, '2026-07-24T09:00:00Z');
        expect(result.services[0].health.state).toBe('unknown');
    });

    it('lar en feilende deploy-fetch for én tjeneste gi unknown uten å velte resten', async () => {
        const failing = {
            listDeployments: async (repo) => {
                if (repo === 'entur/svc-b') throw new Error('boom');
                return [{ id: 1, sha: 'abcdef1234', created_at: '2026-07-24T08:00:00Z' }];
            },
            getStatus: async () => ({ state: 'success', at: '2026-07-24T08:05:00Z', url: 'https://x/log' }),
            getCommitMessage: async () => 'feat: noe (ETU-1) (#9)'
        };
        const result = await buildStatusJson(services, failing, fetchHealthOk, '2026-07-24T09:00:00Z');
        expect(result.services[0].deploy.state).toBe('success');
        expect(result.services[1].deploy.state).toBe('unknown');
    });
});
