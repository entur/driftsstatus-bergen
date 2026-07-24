import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { semantic } from '@entur/tokens';
import { deployLabel, combineSeverity, formatMs, formatPct, timeAgo } from '../lib/statusFormat.js';

const DOT = {
    success: semantic.fill.success.default,
    warning: semantic.fill.warning.default,
    negative: semantic.fill.negative.default,
    neutral: '#9aa0a6'
};

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health } = service;
    const colorKey = combineSeverity(deploy.state, health.state);
    const showMetrics = health.state !== 'unknown';
    return (
        <div style={{
            background: 'white', borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 8, minHeight: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: DOT[colorKey], flex: '0 0 auto' }} />
                <Heading as="h3" variant="subtitle-1" margin="none">{service.name}</Heading>
            </div>
            <Text variant="body" margin="none">{deployLabel(deploy.state)}</Text>
            {deploy.sha && (
                <Text variant="caption" margin="none">
                    {deploy.sha}{deploy.at ? ` · ${timeAgo(deploy.at, now)}` : ''}
                </Text>
            )}
            {showMetrics && (
                <Text variant="caption" margin="none">
                    {`p95 ${formatMs(health.p95Ms)} · 5xx ${formatPct(health.errorRate5xx)} · 4xx ${formatPct(health.errorRate4xx)}`}
                </Text>
            )}
        </div>
    );
}
