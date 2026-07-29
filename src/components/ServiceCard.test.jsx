import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';
import { dotColor, cardTint } from '../lib/statusFormat.js';

const now = new Date('2026-07-29T12:00:00Z');

const asRgb = (hex) => {
    if (hex === 'white') return 'white';
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const deploy = {
    state: 'success',
    environments: [
        { env: 'prd', state: 'success', sha: 'f731fea', at: '2026-07-23T11:35:49Z', commitMessage: 'ETU-74290: Add private_codes table (#1716)', url: 'https://x/prd' },
        { env: 'tst', state: 'success', sha: 'f731fea', at: '2026-07-23T10:37:03Z', commitMessage: 'ETU-74290: Add private_codes table (#1716)', url: 'https://x/tst' },
        { env: 'dev', state: 'failure', sha: '94752e5', at: '2026-07-27T07:01:17Z', commitMessage: 'Bump dep (#1764)', url: 'https://x/dev' }
    ]
};
const health = { state: 'up', up: true, uptime15m: 1 };
const metrics = { window: { avgMs: 71, errorRate4xx: 0.04, errorRate5xx: 0.02 }, lifetime: { avgMs: 60, errorRate4xx: 0.01, errorRate5xx: 0.002 } };

const svc = (over = {}) => ({ name: 'products-spring', repo: 'entur/products-spring', deploy, health, metrics, ...over });

describe('ServiceCard v2', () => {
    it('viser tjenestenavn, oppetid, snitt responstid og kake', () => {
        render(<ServiceCard now={now} service={svc()} />);
        expect(screen.getByText('products-spring')).toBeInTheDocument();
        expect(screen.getByText('Oppe')).toBeInTheDocument();
        expect(screen.getByText(/100 % oppe siste 15 min/)).toBeInTheDocument();
        expect(screen.getByText('71 ms')).toBeInTheDocument();
        expect(screen.getByTestId('pie').dataset.ok).toBe('0.94');
    });

    it('hjertefargen følger health.state (når hero vises)', () => {
        const { rerender } = render(<ServiceCard now={now} service={svc({ health: { state: 'up', up: true, uptime15m: 1 } })} />);
        expect(screen.getByTestId('heart').style.color).toBe(asRgb(dotColor('success')));
        rerender(<ServiceCard now={now} service={svc({ health: { state: 'down', up: false, uptime15m: 0.2 } })} />);
        expect(screen.getByTestId('heart').style.color).toBe(asRgb(dotColor('negative')));
    });

    it('kaka bruker window og faller til lifetime per felt', () => {
        render(<ServiceCard now={now} service={svc({ metrics: { window: { avgMs: null, errorRate4xx: 0, errorRate5xx: null }, lifetime: { avgMs: 60, errorRate4xx: 0.1, errorRate5xx: 0.05 } } })} />);
        expect(screen.getByTestId('pie').dataset.c5).toBe('0.05');
        expect(screen.getByText('60 ms')).toBeInTheDocument();
    });

    // Merk: manglende metrikk gir nå sau-placeholder (ikke tom kake) — se
    // «ServiceCard sau-placeholder» under. Tom kake dekkes av PieChart-testen.

    it('viser deploy-seksjon med upload-ikon, sha, tid og commit-melding', () => {
        const { container } = render(<ServiceCard now={now} service={svc()} />);
        const deploySec = container.querySelector('[data-testid="deploy"]');
        expect(deploySec).toBeInTheDocument();
        expect(deploySec.querySelector('svg')).toBeInTheDocument();
        expect(screen.getByText('f731fea')).toBeInTheDocument();
        expect(screen.getByText(/Deployet/)).toBeInTheDocument();
        expect(screen.getByText('ETU-74290: Add private_codes table (#1716)')).toBeInTheDocument();
    });

    it('viser kun prod — ingen tst/dev', () => {
        render(<ServiceCard now={now} service={svc()} />);
        expect(screen.queryByText('TST')).not.toBeInTheDocument();
        expect(screen.queryByText('DEV')).not.toBeInTheDocument();
        expect(screen.queryByText('94752e5')).not.toBeInTheDocument();
    });

    it('tinter kort-bakgrunnen etter prod-status', () => {
        const { container } = render(<ServiceCard now={now} service={svc({ deploy: { state: 'failure', environments: [{ env: 'prd', state: 'failure', sha: 'bbbbbbb', at: '2026-07-27T08:00:00Z', commitMessage: null, url: 'https://x' }] } })} />);
        expect(container.firstChild.style.background).toBe(asRgb(cardTint('negative')));
    });
});

describe('ServiceCard sau-placeholder', () => {
    it('viser sau og skjuler hero når metrics mangler', () => {
        const { container } = render(<ServiceCard now={now} service={svc({ metrics: { window: {}, lifetime: {} } })} />);
        const sheep = container.querySelector('img[src="/sheep.svg"]');
        expect(sheep).toBeInTheDocument();
        expect(screen.getByText('Venter på data')).toBeInTheDocument();
        expect(container.querySelector('[data-testid="pie"]')).not.toBeInTheDocument();
        expect(container.querySelector('[data-testid="heart"]')).not.toBeInTheDocument();
        expect(container.querySelector('[data-testid="deploy"]')).toBeInTheDocument();
    });
    it('viser sau når health er unknown selv om metrics finnes', () => {
        const { container } = render(<ServiceCard now={now} service={svc({ health: { state: 'unknown', up: null, uptime15m: null } })} />);
        expect(container.querySelector('img[src="/sheep.svg"]')).toBeInTheDocument();
    });
    it('viser hero (ikke sau) når data er komplett', () => {
        const { container } = render(<ServiceCard now={now} service={svc()} />);
        expect(container.querySelector('img[src="/sheep.svg"]')).not.toBeInTheDocument();
        expect(container.querySelector('[data-testid="pie"]')).toBeInTheDocument();
    });
});
