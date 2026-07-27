import React, { useEffect, useState } from 'react';
import { Contrast } from '@entur/layout';
import { semantic } from '@entur/tokens';
import ServiceHealthGrid from './components/ServiceHealthGrid.jsx';
import StatusTicker from './components/StatusTicker.jsx';
import { fetchStatus } from './lib/fetchStatus.js';
import { fetchStatusFeed } from './lib/statusFeed.js';

const STATUS_URL = import.meta.env.VITE_STATUS_URL || '/status.json';
const STATUSPAGE_URL = 'https://status.entur.org/api/v2/summary.json';
const REFRESH_MS = 5 * 60 * 1000;

function App() {
    const [status, setStatus] = useState(null);
    const [statusError, setStatusError] = useState(false);
    const [feed, setFeed] = useState({ messages: [], overall: 'green' });

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const s = await fetchStatus(STATUS_URL);
                if (!cancelled) {
                    setStatus(s);
                    setStatusError(false);
                }
            } catch (e) {
                if (!cancelled) setStatusError(true);
                // behold forrige visning ved feil
            }
            try {
                const f = await fetchStatusFeed(STATUSPAGE_URL);
                if (!cancelled) setFeed(f);
            } catch (e) {
                // behold forrige visning ved feil
            }
        }
        load();
        const interval = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return (
        <div style={{ minHeight: '100vh', width: '100vw', height: '100vh', boxSizing: 'border-box', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Contrast style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.fill.background.contrast.light, flex: '0 0 auto', padding: '10px 24px' }}>
                <img src="/logo.svg" alt="Entur" style={{ height: 64, width: 'auto', objectFit: 'contain' }} />
            </Contrast>

            <div style={{ flex: '1 1 0%', minHeight: 0, background: semantic.fill.background.secondary?.default || '#f2f2f2' }}>
                <ServiceHealthGrid status={status} error={statusError} />
            </div>

            <div style={{ flex: '0 0 auto' }}>
                <StatusTicker messages={feed.messages} overall={feed.overall} />
            </div>
        </div>
    );
}

export default App;
