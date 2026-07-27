import { describe, it, expect } from 'vitest';
import { isStale, deployLabel, deployColorKey, timeAgo, healthColorKey, combineSeverity, formatMs, formatPct, envStateLabel, deployRef, dotColor } from './statusFormat.js';

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

describe('healthColorKey', () => {
    it('mapper helse-state til fargenøkkel', () => {
        expect(healthColorKey('up')).toBe('success');
        expect(healthColorKey('degraded')).toBe('warning');
        expect(healthColorKey('down')).toBe('negative');
        expect(healthColorKey('unknown')).toBe('neutral');
    });
});

describe('combineSeverity', () => {
    it('tar verste av deploy og helse', () => {
        expect(combineSeverity('success', 'up')).toBe('success');
        expect(combineSeverity('success', 'degraded')).toBe('warning');
        expect(combineSeverity('success', 'down')).toBe('negative');
        expect(combineSeverity('failure', 'up')).toBe('negative');
        expect(combineSeverity('in_progress', 'up')).toBe('warning');
    });
    it('lar helse løfte ukjent deploy, og motsatt', () => {
        expect(combineSeverity('unknown', 'up')).toBe('success');
        expect(combineSeverity('success', 'unknown')).toBe('success');
        expect(combineSeverity('unknown', 'unknown')).toBe('neutral');
    });
});

describe('formatMs', () => {
    it('avrunder og legger på ms', () => {
        expect(formatMs(142.7)).toBe('143 ms');
    });
    it('null gir tankestrek', () => {
        expect(formatMs(null)).toBe('–');
    });
});

describe('formatPct', () => {
    it('formatterer brøk som prosent med komma', () => {
        expect(formatPct(0.002)).toBe('0,2 %');
        expect(formatPct(0.011)).toBe('1,1 %');
    });
    it('null gir tankestrek', () => {
        expect(formatPct(null)).toBe('–');
    });
});

describe('envStateLabel', () => {
    it('gir norsk tekst for ikke-success states', () => {
        expect(envStateLabel('in_progress')).toBe('deployer …');
        expect(envStateLabel('failure')).toBe('feilet');
        expect(envStateLabel('unknown')).toBe('ingen data');
    });
    it('gir tom streng for success', () => {
        expect(envStateLabel('success')).toBe('');
    });
});

describe('deployRef', () => {
    it('foretrekker ETU-nummer', () => {
        expect(deployRef({ ticket: 'ETU-73549', pr: 411 })).toBe('ETU-73549');
    });
    it('faller tilbake til PR-nummer', () => {
        expect(deployRef({ ticket: null, pr: 432 })).toBe('PR: 432');
    });
    it('gir tom streng når begge mangler', () => {
        expect(deployRef({ ticket: null, pr: null })).toBe('');
    });
});

describe('dotColor', () => {
    it('gir definert hex-farge for hver fargenøkkel', () => {
        for (const key of ['success', 'warning', 'negative', 'neutral']) {
            expect(dotColor(key)).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
    it('gir riktige deploy-farger fra @entur/tokens', () => {
        expect(dotColor('success')).toBe('#1a8e60');
        expect(dotColor('warning')).toBe('#ffca28');
        expect(dotColor('negative')).toBe('#d31b1b');
        expect(dotColor('neutral')).toBe('#9aa0a6');
    });
    it('faller tilbake til nøytral grå for ukjent nøkkel', () => {
        expect(dotColor('finnesikke')).toBe('#9aa0a6');
    });
});
