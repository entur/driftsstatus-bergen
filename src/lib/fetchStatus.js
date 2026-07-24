export async function fetchStatus(url, fetchImpl = fetch) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`status.json ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.services)) {
        throw new Error('status.json har ugyldig form');
    }
    return data;
}
