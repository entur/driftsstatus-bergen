// Behold fase 2 sine helse-linje-tester; legg til per-miljø-tester. Deploy-objektet
// har nå formen { state, environments[] }.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';

const now = new Date('2026-07-24T10:00:00Z');

const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: '965bd60', at: '2026-06-15T10:21:07Z', ticket: 'ETU-73549', pr: 411, url: 'https://x/prd' },
        { env: 'tst', state: 'in_progress', sha: '6edc092', at: '2026-07-24T09:00:00Z', ticket: null, pr: 432, url: 'https://x/tst' },
        { env: 'dev', state: 'success', sha: '6edc092', at: '2026-07-24T08:00:00Z', ticket: null, pr: 432, url: 'https://x/dev' }
    ]
};
const unknownHealth = { state: 'unknown', up: null, p95Ms: null, errorRate5xx: null, errorRate4xx: null };
const upHealth = { state: 'up', up: true, p95Ms: 142, errorRate5xx: 0.002, errorRate4xx: 0.011 };

describe('ServiceCard', () => {
    it('viser tjenestenavn og en rad per miljø', () => {
        render(<ServiceCard now={now} service={{ name: 'products-api', repo: 'entur/products-api', deploy, health: unknownHealth }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('PRD')).toBeInTheDocument();
        expect(screen.getByText('TST')).toBeInTheDocument();
        expect(screen.getByText('DEV')).toBeInTheDocument();
        expect(screen.getByText('965bd60')).toBeInTheDocument();
        expect(screen.getAllByText('6edc092')).toHaveLength(2);
    });

    it('viser ETU-nummer for prd og PR-fallback for dev', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('ETU-73549')).toBeInTheDocument();
        expect(screen.getAllByText('PR: 432').length).toBeGreaterThanOrEqual(1);
    });

    it('viser statustekst for in_progress', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('deployer …')).toBeInTheDocument();
    });

    it('viser "ingen data" for ukjent miljø', () => {
        const unknownDeploy = {
            state: 'unknown',
            environments: [
                { env: 'prd', state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: 'https://x' },
                { env: 'tst', state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: 'https://x' },
                { env: 'dev', state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: 'https://x' }
            ]
        };
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: unknownDeploy, health: unknownHealth }} />);
        expect(screen.getAllByText('ingen data')).toHaveLength(3);
    });

    it('skjuler metrikk-linja når helse er unknown', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.queryByText(/p95/)).not.toBeInTheDocument();
    });

    it('viser metrikk-linja med p95, 5xx og 4xx når helse finnes', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: upHealth }} />);
        expect(screen.getByText(/p95 142 ms/)).toBeInTheDocument();
        expect(screen.getByText(/5xx 0,2 %/)).toBeInTheDocument();
        expect(screen.getByText(/4xx 1,1 %/)).toBeInTheDocument();
    });
});
