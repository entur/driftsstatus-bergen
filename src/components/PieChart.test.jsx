import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PieChart from './PieChart.jsx';

describe('PieChart', () => {
    it('rendrer tre segmenter fra breakdown', () => {
        render(<PieChart breakdown={{ ok: 0.94, c4: 0.04, c5: 0.02 }} />);
        const pie = screen.getByTestId('pie');
        expect(pie.dataset.ok).toBe('0.94');
        expect(pie.dataset.c4).toBe('0.04');
        expect(pie.dataset.c5).toBe('0.02');
        // jsdom parser ikke conic-gradient; data-attributtene er den testbare kontrakten
        expect(pie.dataset.empty).toBeUndefined();
    });
    it('viser grå tom ring når breakdown er null', () => {
        render(<PieChart breakdown={null} />);
        const pie = screen.getByTestId('pie');
        expect(pie.dataset.empty).toBe('true');
        expect(pie.dataset.ok).toBeUndefined();
    });
    it('respekterer size-prop', () => {
        render(<PieChart breakdown={null} size={80} />);
        const pie = screen.getByTestId('pie');
        expect(pie.style.width).toBe('80px');
        expect(pie.style.height).toBe('80px');
    });
});
