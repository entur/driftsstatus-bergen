import { describe, it, expect } from 'vitest';
import {
    mapDeploymentState,
    selectLatestDeployment,
    extractTicket,
    extractPr,
    buildDeployEnvironment,
    buildDeploy
} from './deployEnvironments.js';

describe('mapDeploymentState', () => {
    it('mapper success', () => {
        expect(mapDeploymentState('success')).toBe('success');
    });
    it('mapper in_progress/queued/pending til in_progress', () => {
        expect(mapDeploymentState('in_progress')).toBe('in_progress');
        expect(mapDeploymentState('queued')).toBe('in_progress');
        expect(mapDeploymentState('pending')).toBe('in_progress');
    });
    it('mapper failure/error/inactive til failure', () => {
        expect(mapDeploymentState('failure')).toBe('failure');
        expect(mapDeploymentState('error')).toBe('failure');
        expect(mapDeploymentState('inactive')).toBe('failure');
    });
    it('mapper waiting og ukjent til unknown', () => {
        expect(mapDeploymentState('waiting')).toBe('unknown');
        expect(mapDeploymentState(undefined)).toBe('unknown');
    });
});

describe('selectLatestDeployment', () => {
    const waiting = { deployment: { sha: 'newnew0' }, statusState: 'waiting' };
    const ok = { deployment: { sha: 'oldold0' }, statusState: 'success' };
    it('hopper over waiting og velger nyeste reelle', () => {
        expect(selectLatestDeployment([waiting, ok])).toBe(ok);
    });
    it('velger første når den er reell', () => {
        expect(selectLatestDeployment([ok])).toBe(ok);
    });
    it('returnerer null når alt er waiting', () => {
        expect(selectLatestDeployment([waiting])).toBeNull();
    });
    it('returnerer null for tom liste', () => {
        expect(selectLatestDeployment([])).toBeNull();
    });
    it('hopper over entries uten status', () => {
        expect(selectLatestDeployment([{ deployment: { sha: 'x' }, statusState: null }, ok])).toBe(ok);
    });
});

describe('extractTicket', () => {
    it('finner ETU-nummer i commit-tittel', () => {
        expect(extractTicket('chore: Bump Spring (ETU-73549) (#411)')).toBe('ETU-73549');
    });
    it('gir null når det mangler', () => {
        expect(extractTicket('chore(deps): Bump setup-java (#432)')).toBeNull();
    });
    it('gir null for null', () => {
        expect(extractTicket(null)).toBeNull();
    });
    it('bruker bare første linje', () => {
        expect(extractTicket('tittel uten\n\nETU-1 i body')).toBeNull();
    });
});

describe('extractPr', () => {
    it('finner PR-nummer', () => {
        expect(extractPr('chore: Bump (ETU-73549) (#411)')).toBe(411);
    });
    it('gir null når det mangler', () => {
        expect(extractPr('vanlig commit uten pr')).toBeNull();
    });
    it('gir null for null', () => {
        expect(extractPr(null)).toBeNull();
    });
});

describe('buildDeployEnvironment', () => {
    it('bygger objekt fra deployment med kort sha og referanser', () => {
        const env = buildDeployEnvironment({
            env: 'prd',
            sha: '965bd6012345',
            at: '2026-06-15T10:21:07Z',
            statusState: 'success',
            commitMessage: 'chore: Bump (ETU-73549) (#411)',
            url: 'https://x/log',
            repo: 'entur/products-api'
        });
        expect(env).toEqual({
            env: 'prd',
            state: 'success',
            sha: '965bd60',
            at: '2026-06-15T10:21:07Z',
            ticket: 'ETU-73549',
            pr: 411,
            url: 'https://x/log'
        });
    });
    it('gir unknown-objekt når sha mangler', () => {
        const env = buildDeployEnvironment({ env: 'tst', sha: null, repo: 'entur/products-api' });
        expect(env).toEqual({
            env: 'tst',
            state: 'unknown',
            sha: null,
            at: null,
            ticket: null,
            pr: null,
            url: 'https://github.com/entur/products-api/deployments'
        });
    });
});

describe('buildDeploy', () => {
    const dev = { env: 'dev', state: 'success' };
    const tst = { env: 'tst', state: 'in_progress' };
    const prd = { env: 'prd', state: 'success' };
    it('sorterer prd, tst, dev og setter headline = prd', () => {
        const deploy = buildDeploy([dev, tst, prd]);
        expect(deploy.environments.map((e) => e.env)).toEqual(['prd', 'tst', 'dev']);
        expect(deploy.state).toBe('success');
    });
    it('gir unknown headline når prd mangler', () => {
        const deploy = buildDeploy([dev, tst]);
        expect(deploy.state).toBe('unknown');
    });
});
