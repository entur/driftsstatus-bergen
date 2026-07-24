import React from 'react';

const COLORS = {
    green: { bg: '#2d8a4e', fg: '#ffffff' },
    yellow: { bg: '#f5c542', fg: '#1a1a1a' },
    red: { bg: '#c4271e', fg: '#ffffff' },
};

export default function StatusTicker({ messages = [], overall = 'green' }) {
    const c = COLORS[overall] || COLORS.green;
    const hasMessages = overall !== 'green' && messages.length > 0;
    const titles = messages.map((m) => m.title);

    return (
        <div
            className="ticker-bar"
            data-overall={overall}
            style={{ background: c.bg, color: c.fg }}
        >
            <div className="ticker-label">Driftsstatus</div>
            <div className="ticker-scroll-wrap">
                {hasMessages ? (
                    <div className="ticker-track">
                        {[...titles, ...titles].map((title, idx) => (
                            <span key={idx} className="ticker-item">
                                <span aria-hidden="true" style={{ opacity: 0.6, marginRight: 12 }}>●</span>
                                {title}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="ticker-static">Ingen avvik – alle systemer i normal drift</span>
                )}
            </div>
        </div>
    );
}
