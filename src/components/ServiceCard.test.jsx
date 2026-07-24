import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard.jsx';

const now = new Date('2026-07-24T10:00:00Z');
const base = { name: 'products-api', repo: 'entur/products-api', health: { state: 'unknown', errorRate: null, p95Ms: null } };

describe('ServiceCard', () => {
    it('viser tjenestenavn og deployet-status', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy: { state: 'success', sha: 'abc1234', at: '2026-07-24T09:00:00Z', url: 'https://x', version: null } }} />);
        expect(screen.getByText('products-api')).toBeInTheDocument();
        expect(screen.getByText('Deployet')).toBeInTheDocument();
        expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    });
    it('viser feil-status ved failure', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy: { state: 'failure', sha: 'def5678', at: '2026-07-24T09:00:00Z', url: 'https://x', version: null } }} />);
        expect(screen.getByText('Deploy feilet')).toBeInTheDocument();
    });
    it('viser ukjent uten sha', () => {
        render(<ServiceCard now={now} service={{ ...base, deploy: { state: 'unknown', sha: null, at: null, url: 'https://x', version: null } }} />);
        expect(screen.getByText('Ukjent')).toBeInTheDocument();
    });
});
