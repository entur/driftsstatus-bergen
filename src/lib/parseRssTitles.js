export function parseRssTitles(xmlText, limit = 15) {
    try {
        const xml = new window.DOMParser().parseFromString(xmlText, 'application/xml');
        if (xml.querySelector('parsererror')) return [];
        const items = Array.from(xml.querySelectorAll('item')).slice(0, limit);
        return items.map((item) => ({
            title: item.querySelector('title')?.textContent ?? '',
            pubDate: item.querySelector('pubDate')?.textContent ?? ''
        }));
    } catch {
        return [];
    }
}
