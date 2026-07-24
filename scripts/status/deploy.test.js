import { describe, it, expect } from 'vitest';
import { selectDeployRun, mapDeployState, buildDeploy } from './deploy.js';

const cdOld = { name: 'cd', status: 'completed', conclusion: 'success', head_sha: 'aaaaaaa000', run_started_at: '2026-07-24T06:00:00Z', html_url: 'https://x/1' };
const cdNew = { name: 'cd', status: 'completed', conclusion: 'failure', head_sha: 'bbbbbbb111', run_started_at: '2026-07-24T08:00:00Z', html_url: 'https://x/2' };
const ci = { name: 'ci-pr', status: 'completed', conclusion: 'success', head_sha: 'ccccccc222', run_started_at: '2026-07-24T09:00:00Z', html_url: 'https://x/3' };

describe('selectDeployRun', () => {
    it('velger nyeste run med matchende workflow-navn', () => {
        const run = selectDeployRun([cdOld, cdNew, ci], ['cd']);
        expect(run).toBe(cdNew);
    });
    it('ignorerer runs som ikke matcher navnet', () => {
        const run = selectDeployRun([ci], ['cd']);
        expect(run).toBeNull();
    });
    it('returnerer null for tom liste', () => {
        expect(selectDeployRun([], ['cd'])).toBeNull();
    });
});

describe('mapDeployState', () => {
    it('mapper fullført suksess til success', () => {
        expect(mapDeployState({ status: 'completed', conclusion: 'success' })).toBe('success');
    });
    it('mapper fullført feil/kansellert til failure', () => {
        expect(mapDeployState({ status: 'completed', conclusion: 'failure' })).toBe('failure');
        expect(mapDeployState({ status: 'completed', conclusion: 'cancelled' })).toBe('failure');
    });
    it('mapper ikke-fullført (waiting/queued/in_progress) til in_progress', () => {
        expect(mapDeployState({ status: 'waiting', conclusion: '' })).toBe('in_progress');
        expect(mapDeployState({ status: 'in_progress', conclusion: null })).toBe('in_progress');
    });
});

describe('buildDeploy', () => {
    it('bygger deploy-objekt fra run med kort sha', () => {
        const d = buildDeploy(cdNew, 'entur/products-api');
        expect(d).toEqual({ state: 'failure', sha: 'bbbbbbb', at: '2026-07-24T08:00:00Z', url: 'https://x/2', version: null });
    });
    it('returnerer unknown-state når run er null', () => {
        const d = buildDeploy(null, 'entur/products-api');
        expect(d).toEqual({ state: 'unknown', sha: null, at: null, url: 'https://github.com/entur/products-api/actions', version: null });
    });
});
