// Behold fase 2 sine helse-linje-tester; legg til per-miljø-tester. Deploy-objektet
// har nå formen { state, environments[] }.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';
import { dotColor } from '../lib/statusFormat.js';

const now = new Date('2026-07-24T10:00:00Z');

const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: '965bd60', at: '2026-06-15T10:21:07Z', ticket: 'ETU-73549', pr: 411, commitMessage: 'feat: øk timeout for katalog-oppslag', url: 'https://x/prd' },
        { env: 'tst', state: 'in_progress', sha: '6edc092', at: '2026-07-24T09:00:00Z', ticket: null, pr: 432, commitMessage: 'chore: bump avhengigheter', url: 'https://x/tst' },
        { env: 'dev', state: 'success', sha: '6edc092', at: '2026-07-24T08:00:00Z', ticket: null, pr: 432, commitMessage: 'chore: bump avhengigheter', url: 'https://x/dev' }
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

    it('viser commit-subjekt per miljø og ikke lenger ETU/PR-referanse', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('feat: øk timeout for katalog-oppslag')).toBeInTheDocument();
        expect(screen.getAllByText('chore: bump avhengigheter')).toHaveLength(2);
        expect(screen.queryByText('ETU-73549')).not.toBeInTheDocument();
        expect(screen.queryByText('PR: 432')).not.toBeInTheDocument();
    });

    it('utelater commit-linja når commitMessage mangler', () => {
        const noMsg = {
            state: 'unknown',
            environments: [
                { env: 'prd', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' },
                { env: 'tst', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' },
                { env: 'dev', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' }
            ]
        };
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: noMsg, health: unknownHealth }} />);
        expect(container.querySelectorAll('[data-testid="commit-subject"]')).toHaveLength(0);
    });

    it('fargelegger miljø-prikken etter deploy-state (grønn/rød/grå)', () => {
        const stateDeploy = {
            state: 'failure',
            environments: [
                { env: 'prd', state: 'success', sha: 'aaaaaaa', at: '2026-06-15T10:21:07Z', ticket: null, pr: null, commitMessage: null, url: 'https://x' },
                { env: 'tst', state: 'unknown', sha: null, at: null, ticket: null, pr: null, commitMessage: null, url: 'https://x' },
                { env: 'dev', state: 'failure', sha: 'bbbbbbb', at: '2026-07-24T08:00:00Z', ticket: null, pr: null, commitMessage: null, url: 'https://x' }
            ]
        };
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: stateDeploy, health: unknownHealth }} />);
        const envDots = [...container.querySelectorAll('span')].filter((s) => s.style.width === '10px');
        const backgrounds = envDots.map((s) => s.style.background);
        // jsdom normaliserer inline hex til rgb(); konverter dotColor tilsvarende
        const asRgb = (hex) => {
            const n = parseInt(hex.slice(1), 16);
            return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
        };
        expect(backgrounds).toEqual([asRgb(dotColor('success')), asRgb(dotColor('neutral')), asRgb(dotColor('negative'))]);
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
