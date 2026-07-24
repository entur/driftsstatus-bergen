import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';

const now = new Date('2026-07-24T10:00:00Z');
const deploy = (state, extra = {}) => ({ state, sha: 'abc1234', at: '2026-07-24T09:00:00Z', url: 'https://x', version: null, ...extra });
const unknownHealth = { state: 'unknown', up: null, p95Ms: null, errorRate5xx: null, errorRate4xx: null };
const upHealth = { state: 'up', up: true, p95Ms: 142, errorRate5xx: 0.002, errorRate4xx: 0.011 };

describe('ServiceCard', () => {
    it('viser navn og deploy-status', () => {
        render(<ServiceCard now={now} service={{ name: 'products-api', repo: 'entur/products-api', deploy: deploy('success'), health: unknownHealth }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('Deployet')).toBeInTheDocument();
    });

    it('skjuler metrikk-linja når helse er unknown', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: deploy('success'), health: unknownHealth }} />);
        expect(screen.queryByText(/p95/)).not.toBeInTheDocument();
    });

    it('viser metrikk-linja med p95, 5xx og 4xx når helse finnes', () => {
        render(<ServiceCard now={now} service={{ name: 'a', repo: 'entur/a', deploy: deploy('success'), health: upHealth }} />);
        expect(screen.getByText(/p95 142 ms/)).toBeInTheDocument();
        expect(screen.getByText(/5xx 0,2 %/)).toBeInTheDocument();
        expect(screen.getByText(/4xx 1,1 %/)).toBeInTheDocument();
    });
});
