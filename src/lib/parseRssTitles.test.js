import { describe, it, expect } from 'vitest';
import { parseRssTitles } from './parseRssTitles.js';

const xml = `<?xml version="1.0"?><rss><channel>
  <item><title>Hendelse A</title><pubDate>Mon, 21 Jul 2026 10:00:00 GMT</pubDate></item>
  <item><title>Hendelse B</title><pubDate>Mon, 21 Jul 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

describe('parseRssTitles', () => {
    it('henter ut titler og pubDate', () => {
        const items = parseRssTitles(xml);
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ title: 'Hendelse A', pubDate: 'Mon, 21 Jul 2026 10:00:00 GMT' });
    });
    it('respekterer limit', () => {
        expect(parseRssTitles(xml, 1)).toHaveLength(1);
    });
    it('returnerer tom liste for ugyldig xml', () => {
        expect(parseRssTitles('', 5)).toEqual([]);
    });
});
