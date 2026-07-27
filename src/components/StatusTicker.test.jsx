import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusTicker from './StatusTicker.jsx';

describe('StatusTicker', () => {
    it('viser alltid den faste Driftsstatus-etiketten', () => {
        render(<StatusTicker messages={[]} overall="green" />);
        expect(screen.getByText('Driftsstatus')).toBeInTheDocument();
    });
    it('viser standardtekst når det ikke er avvik', () => {
        render(<StatusTicker messages={[]} overall="green" />);
        expect(screen.getByText(/ingen avvik/i)).toBeInTheDocument();
    });
    it('viser meldingstitler når det finnes avvik', () => {
        render(<StatusTicker messages={[{ title: 'Feil A', kind: 'ongoing' }]} overall="red" />);
        expect(screen.getAllByText('Feil A').length).toBeGreaterThan(0);
    });
    it('setter data-overall for fargekoding', () => {
        const { container } = render(<StatusTicker messages={[]} overall="yellow" />);
        expect(container.querySelector('[data-overall="yellow"]')).not.toBeNull();
    });
});
