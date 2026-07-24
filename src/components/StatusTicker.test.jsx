import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusTicker from './StatusTicker.jsx';

describe('StatusTicker', () => {
    it('viser titlene fra feeden', () => {
        render(<StatusTicker items={[{ title: 'Hendelse A', pubDate: '' }, { title: 'Hendelse B', pubDate: '' }]} />);
        expect(screen.getAllByText('Hendelse A').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Hendelse B').length).toBeGreaterThan(0);
    });
    it('viser standardtekst når feeden er tom', () => {
        render(<StatusTicker items={[]} />);
        expect(screen.getByText(/ingen driftsmeldinger/i)).toBeInTheDocument();
    });
});
