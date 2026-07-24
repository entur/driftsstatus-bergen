export async function fetchStatus(url, fetchImpl = fetch) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`status.json ${res.status}`);
    return res.json();
}
