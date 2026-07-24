import { describe, it, expect } from 'vitest';
import { isStale, deployLabel, deployColorKey, timeAgo } from './statusFormat.js';

describe('isStale', () => {
    const now = new Date('2026-07-24T10:00:00Z');
    it('er fersk innenfor 15 min', () => {
        expect(isStale('2026-07-24T09:50:00Z', now)).toBe(false);
    });
    it('er utdatert etter 15 min', () => {
        expect(isStale('2026-07-24T09:40:00Z', now)).toBe(true);
    });
});

describe('deployLabel', () => {
    it('gir norske etiketter', () => {
        expect(deployLabel('success')).toBe('Deployet');
        expect(deployLabel('failure')).toBe('Deploy feilet');
        expect(deployLabel('in_progress')).toBe('Deployer …');
        expect(deployLabel('unknown')).toBe('Ukjent');
    });
});

describe('deployColorKey', () => {
    it('mapper state til fargenøkkel', () => {
        expect(deployColorKey('success')).toBe('success');
        expect(deployColorKey('in_progress')).toBe('warning');
        expect(deployColorKey('failure')).toBe('negative');
        expect(deployColorKey('unknown')).toBe('neutral');
    });
});

describe('timeAgo', () => {
    it('gir norsk relativ tid', () => {
        const now = new Date('2026-07-24T10:00:00Z');
        expect(timeAgo('2026-07-24T09:00:00Z', now)).toMatch(/time/);
    });
    it('gir tom streng for null', () => {
        expect(timeAgo(null, new Date())).toBe('');
    });
});
