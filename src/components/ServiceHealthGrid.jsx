import React from 'react';
import { Text } from '@entur/typography/beta';
import ServiceCard from './ServiceCard.jsx';
import { isStale } from '../lib/statusFormat.js';

export default function ServiceHealthGrid({ status, now = new Date() }) {
    if (!status) {
        return <div style={{ padding: 40 }}><Text variant="body">Laster status …</Text></div>;
    }
    const stale = isStale(status.generatedAt, now);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box', padding: 24, gap: 16 }}>
            {stale && (
                <div style={{ background: '#f9c66b', color: '#3d2b00', padding: '8px 16px', borderRadius: 8, fontWeight: 600 }}>
                    Data er utdatert — statusinnhenting kan være nede.
                </div>
            )}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16, alignContent: 'start', overflow: 'hidden'
            }}>
                {status.services.map((svc) => (
                    <ServiceCard key={svc.name} service={svc} now={now} />
                ))}
            </div>
        </div>
    );
}
