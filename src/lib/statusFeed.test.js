import { describe, it, expect } from 'vitest';
import { parseStatusFeed, utledOverall, fetchStatusFeed } from './statusFeed.js';

describe('utledOverall', () => {
    it('gir green for tom liste', () => {
        expect(utledOverall([])).toBe('green');
    });
    it('gir yellow når kun planlagt', () => {
        expect(utledOverall([{ title: 'Vedlikehold', kind: 'planned' }])).toBe('yellow');
    });
    it('gir red når minst én pågående', () => {
        expect(utledOverall([{ title: 'Feil', kind: 'ongoing' }])).toBe('red');
    });
    it('prioriterer red over yellow ved blanding', () => {
        expect(utledOverall([
            { title: 'Vedlikehold', kind: 'planned' },
            { title: 'Feil', kind: 'ongoing' },
        ])).toBe('red');
    });
});

describe('parseStatusFeed', () => {
    it('tar uløste hendelser som ongoing og gir red', () => {
        const json = {
            incidents: [{ name: 'Problemer med billettering', status: 'investigating' }],
            scheduled_maintenances: [],
        };
        const r = parseStatusFeed(json);
        expect(r.messages).toEqual([{ title: 'Problemer med billettering', kind: 'ongoing' }]);
        expect(r.overall).toBe('red');
    });
    it('tar kommende og aktivt vedlikehold som planned og gir yellow', () => {
        const json = {
            incidents: [],
            scheduled_maintenances: [
                { name: 'Planlagt vedlikehold', status: 'scheduled' },
                { name: 'Pågående vedlikehold', status: 'in_progress' },
            ],
        };
        const r = parseStatusFeed(json);
        expect(r.messages).toEqual([
            { title: 'Planlagt vedlikehold', kind: 'planned' },
            { title: 'Pågående vedlikehold', kind: 'planned' },
        ]);
        expect(r.overall).toBe('yellow');
    });
    it('filtrerer bort løste hendelser og fullført vedlikehold', () => {
        const json = {
            incidents: [{ name: 'Løst', status: 'resolved' }],
            scheduled_maintenances: [{ name: 'Ferdig', status: 'completed' }],
        };
        const r = parseStatusFeed(json);
        expect(r.messages).toEqual([]);
        expect(r.overall).toBe('green');
    });
    it('er fail-safe for tomt/ugyldig objekt', () => {
        expect(parseStatusFeed(null)).toEqual({ messages: [], overall: 'green' });
        expect(parseStatusFeed({})).toEqual({ messages: [], overall: 'green' });
    });
});

describe('fetchStatusFeed', () => {
    it('henter og parser summary.json', async () => {
        const fakeFetch = async () => ({
            ok: true,
            json: async () => ({
                incidents: [{ name: 'Feil', status: 'investigating' }],
                scheduled_maintenances: [],
            }),
        });
        const r = await fetchStatusFeed('/x', fakeFetch);
        expect(r.overall).toBe('red');
        expect(r.messages).toHaveLength(1);
    });
    it('kaster ved ikke-ok respons', async () => {
        const fakeFetch = async () => ({ ok: false, status: 503 });
        await expect(fetchStatusFeed('/x', fakeFetch)).rejects.toThrow();
    });
});
