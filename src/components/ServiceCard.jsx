import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { dotColor, deployColorKey, combineSeverity, envStateLabel, deployRef, formatMs, formatPct, timeAgo } from '../lib/statusFormat.js';

function EnvRow({ env, now }) {
    const ref = deployRef(env);
    const secondary = env.state === 'success' ? timeAgo(env.at, now) : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
                <Text variant="body" margin="none" style={{ fontWeight: 600, minWidth: 34 }}>{env.env.toUpperCase()}</Text>
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace' }}>{env.sha}</Text>}
                {ref && <Text variant="body" margin="none">{ref}</Text>}
            </div>
            {secondary && <Text variant="caption" margin="none" style={{ marginLeft: 18 }}>{secondary}</Text>}
        </div>
    );
}

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health } = service;
    const colorKey = combineSeverity(deploy.state, health.state);
    const showMetrics = health.state !== 'unknown';
    return (
        <div style={{
            background: 'white', borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 10, minHeight: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: dotColor(colorKey), flex: '0 0 auto' }} />
                <Heading as="h3" variant="subtitle-1" margin="none">{service.name}</Heading>
            </div>
            {deploy.environments.map((env) => <EnvRow key={env.env} env={env} now={now} />)}
            {showMetrics && (
                <Text variant="caption" margin="none">
                    {`p95 ${formatMs(health.p95Ms)} · 5xx ${formatPct(health.errorRate5xx)} · 4xx ${formatPct(health.errorRate4xx)}`}
                </Text>
            )}
        </div>
    );
}
