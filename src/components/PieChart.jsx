import React from 'react';
import { dotColor } from '../lib/statusFormat.js';

export default function PieChart({ breakdown, size = 118 }) {
    const base = { width: size, height: size, borderRadius: '50%', flex: '0 0 auto' };
    if (!breakdown) {
        return <div data-testid="pie" data-empty="true" style={{ ...base, background: dotColor('neutral') }} />;
    }
    const { ok, c4, c5 } = breakdown;
    const g = dotColor('success');
    const y = dotColor('warning');
    const r = dotColor('negative');
    const okEnd = ok * 100;
    const c4End = okEnd + c4 * 100;
    const round4 = (n) => String(Math.round(n * 10000) / 10000);
    return (
        <div
            data-testid="pie"
            data-ok={round4(ok)}
            data-c4={round4(c4)}
            data-c5={round4(c5)}
            style={{
                ...base,
                backgroundImage: `conic-gradient(${g} 0 ${okEnd}%, ${y} ${okEnd}% ${c4End}%, ${r} ${c4End}% 100%)`
            }}
        />
    );
}
