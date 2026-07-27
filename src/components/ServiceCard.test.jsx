import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';
import { dotColor, cardTint } from '../lib/statusFormat.js';

const now = new Date('2026-07-24T10:00:00Z');

const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: '965bd60', at: '2026-06-15T10:21:07Z', commitMessage: 'feat: øk timeout for katalog-oppslag', url: 'https://x/prd' },
        { env: 'tst', state: 'in_progress', sha: '6edc092', at: '2026-07-24T09:00:00Z', commitMessage: 'chore: bump avhengigheter', url: 'https://x/tst' },
        { env: 'dev', state: 'success', sha: '6edc092', at: '2026-07-24T08:00:00Z', commitMessage: 'chore: bump avhengigheter', url: 'https://x/dev' }
    ]
};
const unknownHealth = { state: 'unknown', up: null, p95Ms: null, errorRate5xx: null, errorRate4xx: null };
const upHealth = { state: 'up', up: true, p95Ms: 142, errorRate5xx: 0.002, errorRate4xx: 0.011 };

const asRgb = (hex) => {
    if (hex === 'white') return 'white';
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('ServiceCard', () => {
    it('viser tjenestenavn og alle tre miljøene', () => {
        render(<ServiceCard now={now} service={{ name: 'products-api', repo: 'entur/products-api', deploy, health: unknownHealth }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('PRD')).toBeInTheDocument();
        expect(screen.getByText('TST')).toBeInTheDocument();
        expect(screen.getByText('DEV')).toBeInTheDocument();
        expect(screen.getByText('965bd60')).toBeInTheDocument();
        expect(screen.getAllByText('6edc092')).toHaveLength(2);
    });

    it('viser helse-indikatorraden med tre ikoner', () => {
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: upHealth }} />);
        const row = container.querySelector('[data-testid="health-row"]');
        expect(row).toBeInTheDocument();
        expect(row.querySelectorAll('svg')).toHaveLength(3);
    });

    it('viser suksessrate og p95 som verdier (ikke 4xx/5xx-tekst)', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: upHealth }} />);
        // suksessrate = 1 - 0,011 - 0,002 = 0,987
        expect(screen.getByText('98,7 %')).toBeInTheDocument();
        expect(screen.getByText('142 ms')).toBeInTheDocument();
        expect(screen.queryByText(/5xx/)).not.toBeInTheDocument();
        expect(screen.queryByText(/4xx/)).not.toBeInTheDocument();
    });

    it('viser – for verdiene når helse er unknown', () => {
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        const row = container.querySelector('[data-testid="health-row"]');
        expect(row.textContent).toContain('–');
    });

    it('viser commit-melding kun for prd, ikke for tst/dev', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('feat: øk timeout for katalog-oppslag')).toBeInTheDocument();
        expect(screen.queryByText('chore: bump avhengigheter')).not.toBeInTheDocument();
    });

    it('fremhever prd-prikken (14px) og gjør tst/dev kompakte (8px)', () => {
        const { container } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        const dots = [...container.querySelectorAll('span')].filter((s) => s.style.borderRadius === '50%');
        const big = dots.filter((s) => s.style.width === '14px');
        const small = dots.filter((s) => s.style.width === '8px');
        expect(big).toHaveLength(1);
        expect(small).toHaveLength(2);
    });

    it('viser statustekst for in_progress i kompakt rad', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy, health: unknownHealth }} />);
        expect(screen.getByText('deployer …')).toBeInTheDocument();
    });

    it('tinter kort-bakgrunnen etter prd-status', () => {
        const successDeploy = { state: 'success', environments: [{ env: 'prd', state: 'success', sha: 'aaaaaaa', at: '2026-06-15T10:21:07Z', commitMessage: null, url: 'https://x' }] };
        const failDeploy = { state: 'failure', environments: [{ env: 'prd', state: 'failure', sha: 'bbbbbbb', at: '2026-07-24T08:00:00Z', commitMessage: null, url: 'https://x' }] };
        const unknownDeploy = { state: 'unknown', environments: [{ env: 'prd', state: 'unknown', sha: null, at: null, commitMessage: null, url: 'https://x' }] };

        const { container: cS } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: successDeploy, health: unknownHealth }} />);
        expect(cS.firstChild.style.background).toBe(asRgb(cardTint('success')));
        const { container: cF } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: failDeploy, health: unknownHealth }} />);
        expect(cF.firstChild.style.background).toBe(asRgb(cardTint('negative')));
        const { container: cU } = render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: unknownDeploy, health: unknownHealth }} />);
        expect(cU.firstChild.style.background).toBe('white');
    });
});
