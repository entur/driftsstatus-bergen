import React from 'react';

export default function StatusTicker({ items }) {
    if (!items || items.length === 0) {
        return (
            <div style={{ background: '#1a1a1a', color: 'white', padding: '10px 24px', fontSize: '1rem' }}>
                Ingen driftsmeldinger fra status.entur.org
            </div>
        );
    }
    const line = items.map((it) => it.title);
    return (
        <div style={{ background: '#1a1a1a', color: 'white', overflow: 'hidden', padding: '10px 0', width: '100%' }}>
            <div className="ticker-track">
                {[...line, ...line].map((title, idx) => (
                    <span key={idx} style={{ padding: '0 32px', fontSize: '1rem' }}>
                        <span aria-hidden="true" style={{ opacity: 0.5, marginRight: 12 }}>●</span>
                        {title}
                    </span>
                ))}
            </div>
        </div>
    );
}
