import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceHealthGrid from './ServiceHealthGrid.jsx';

const now = new Date('2026-07-24T10:00:00Z');
const svc = (name) => ({ name, repo: `entur/${name}`, deploy: { state: 'success', sha: 'abc1234', at: '2026-07-24T09:55:00Z', url: 'https://x', version: null }, health: { state: 'unknown', errorRate: null, p95Ms: null } });

describe('ServiceHealthGrid', () => {
    it('rendrer ett kort per tjeneste', () => {
        render(<ServiceHealthGrid now={now} status={{ generatedAt: '2026-07-24T09:58:00Z', services: [svc('a'), svc('b')] }} />);
        expect(screen.getByText('a')).toBeInTheDocument();
        expect(screen.getByText('b')).toBeInTheDocument();
    });
    it('viser stale-banner når data er gammelt', () => {
        render(<ServiceHealthGrid now={now} status={{ generatedAt: '2026-07-24T09:30:00Z', services: [svc('a')] }} />);
        expect(screen.getByText(/utdatert/i)).toBeInTheDocument();
    });
    it('viser ikke stale-banner for ferske data', () => {
        render(<ServiceHealthGrid now={now} status={{ generatedAt: '2026-07-24T09:58:00Z', services: [svc('a')] }} />);
        expect(screen.queryByText(/utdatert/i)).not.toBeInTheDocument();
    });
    it('viser lastemelding når status er null', () => {
        render(<ServiceHealthGrid now={now} status={null} />);
        expect(screen.getByText(/laster/i)).toBeInTheDocument();
    });
});
