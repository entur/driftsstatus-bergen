import { describe, it, expect } from 'vitest';
import { fetchStatus } from './fetchStatus.js';

describe('fetchStatus', () => {
    it('returnerer parset json ved OK', async () => {
        const payload = { generatedAt: 'x', services: [] };
        const fakeFetch = async () => ({ ok: true, json: async () => payload });
        await expect(fetchStatus('http://x', fakeFetch)).resolves.toEqual(payload);
    });
    it('kaster ved ikke-OK', async () => {
        const fakeFetch = async () => ({ ok: false, status: 500 });
        await expect(fetchStatus('http://x', fakeFetch)).rejects.toThrow('500');
    });
    it('kaster når services mangler', async () => {
        const fakeFetch = async () => ({ ok: true, json: async () => ({ generatedAt: 'x' }) });
        await expect(fetchStatus('http://x', fakeFetch)).rejects.toThrow(/ugyldig form/);
    });
});
