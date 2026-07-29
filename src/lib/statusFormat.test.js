import { describe, it, expect } from 'vitest';
import { isStale, deployLabel, deployColorKey, timeAgo, healthColorKey, combineSeverity, formatMs, formatPct, envStateLabel, deployRef, dotColor, cardTint, successRate, metricColorKey, prdColorKey, SUCCESS_RATE_THRESHOLDS, P95_THRESHOLDS, pickMetric, responseBreakdown, formatUptime15m } from './statusFormat.js';

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

describe('cardTint', () => {
    it('gir svake muted-bakgrunnsfarger fra @entur/tokens', () => {
        expect(cardTint('success')).toBe('#d0f1e3');
        expect(cardTint('warning')).toBe('#fff4cd');
        expect(cardTint('negative')).toBe('#ffcece');
    });
    it('gir hvit for neutral', () => {
        expect(cardTint('neutral')).toBe('white');
    });
    it('faller tilbake til hvit for ukjent nøkkel', () => {
        expect(cardTint('finnesikke')).toBe('white');
    });
});

describe('successRate', () => {
    it('regner ut andelen som ikke er 4xx/5xx', () => {
        expect(successRate({ errorRate4xx: 0.011, errorRate5xx: 0.002 })).toBeCloseTo(0.987, 5);
    });
    it('returnerer null når en rate mangler', () => {
        expect(successRate({ errorRate4xx: null, errorRate5xx: 0.002 })).toBeNull();
        expect(successRate({ errorRate4xx: 0.01, errorRate5xx: undefined })).toBeNull();
    });
});

describe('metricColorKey', () => {
    it('higherIsBetter: grønn/gul/rød etter terskel', () => {
        expect(metricColorKey(0.999, SUCCESS_RATE_THRESHOLDS)).toBe('success');
        expect(metricColorKey(0.995, SUCCESS_RATE_THRESHOLDS)).toBe('success');
        expect(metricColorKey(0.992, SUCCESS_RATE_THRESHOLDS)).toBe('warning');
        expect(metricColorKey(0.98, SUCCESS_RATE_THRESHOLDS)).toBe('negative');
    });
    it('lowerIsBetter: grønn/gul/rød etter terskel', () => {
        expect(metricColorKey(142, P95_THRESHOLDS)).toBe('success');
        expect(metricColorKey(300, P95_THRESHOLDS)).toBe('success');
        expect(metricColorKey(500, P95_THRESHOLDS)).toBe('warning');
        expect(metricColorKey(1200, P95_THRESHOLDS)).toBe('negative');
    });
    it('returnerer neutral for null/undefined', () => {
        expect(metricColorKey(null, P95_THRESHOLDS)).toBe('neutral');
        expect(metricColorKey(undefined, SUCCESS_RATE_THRESHOLDS)).toBe('neutral');
    });
});

describe('prdColorKey', () => {
    const mk = (prdState, healthState) => ({
        deploy: { environments: [{ env: 'prd', state: prdState }, { env: 'dev', state: 'failure' }] },
        health: { state: healthState }
    });
    it('bruker prd-miljøet, ikke dev', () => {
        expect(prdColorKey(mk('success', 'unknown'))).toBe('success');
        expect(prdColorKey(mk('failure', 'unknown'))).toBe('negative');
    });
    it('kombinerer med helse-state (verste vinner)', () => {
        expect(prdColorKey(mk('success', 'down'))).toBe('negative');
    });
    it('neutral når prd mangler', () => {
        expect(prdColorKey({ deploy: { environments: [{ env: 'dev', state: 'success' }] }, health: { state: 'unknown' } })).toBe('neutral');
    });
});

describe('pickMetric', () => {
    const metrics = { window: { avgMs: 71, errorRate4xx: 0, errorRate5xx: null }, lifetime: { avgMs: 60, errorRate4xx: 0.01, errorRate5xx: 0.002 } };
    it('bruker window når feltet finnes', () => {
        expect(pickMetric(metrics, 'avgMs')).toBe(71);
        expect(pickMetric(metrics, 'errorRate4xx')).toBe(0);
    });
    it('faller til lifetime når window-feltet er null', () => {
        expect(pickMetric(metrics, 'errorRate5xx')).toBe(0.002);
    });
    it('returnerer null når begge mangler', () => {
        expect(pickMetric({ window: {}, lifetime: {} }, 'avgMs')).toBeNull();
        expect(pickMetric(undefined, 'avgMs')).toBeNull();
        expect(pickMetric(null, 'avgMs')).toBeNull();
    });
});

describe('responseBreakdown', () => {
    it('regner ok/c4/c5 med window-først', () => {
        const m = { window: { errorRate4xx: 0.04, errorRate5xx: 0.02 } };
        expect(responseBreakdown(m)).toEqual({ ok: 0.94, c4: 0.04, c5: 0.02 });
    });
    it('faller til lifetime per felt', () => {
        const m = { window: { errorRate4xx: 0, errorRate5xx: null }, lifetime: { errorRate4xx: 0.1, errorRate5xx: 0.05 } };
        expect(responseBreakdown(m)).toEqual({ ok: 0.95, c4: 0, c5: 0.05 });
    });
    it('klamper ok til minst 0', () => {
        const m = { window: { errorRate4xx: 0.7, errorRate5xx: 0.5 } };
        expect(responseBreakdown(m).ok).toBe(0);
    });
    it('returnerer null når en rate mangler i begge vindu', () => {
        expect(responseBreakdown({ window: {}, lifetime: {} })).toBeNull();
        expect(responseBreakdown(undefined)).toBeNull();
    });
});

describe('formatUptime15m', () => {
    it('formatterer andel som heltallsprosent', () => {
        expect(formatUptime15m(1)).toBe('100 %');
        expect(formatUptime15m(0.933)).toBe('93 %');
    });
    it('null/undefined gir tankestrek', () => {
        expect(formatUptime15m(null)).toBe('–');
        expect(formatUptime15m(undefined)).toBe('–');
    });
});
