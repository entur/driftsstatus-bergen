import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { dotColor, cardTint, deployColorKey, combineSeverity, envStateLabel, formatMs, formatPct, timeAgo } from '../lib/statusFormat.js';

function EnvRow({ env, now }) {
    const secondary = env.state === 'success' ? timeAgo(env.at, now) : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
                <Text variant="body" margin="none" style={{ fontWeight: 600, minWidth: 34 }}>{env.env.toUpperCase()}</Text>
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace' }}>{env.sha}</Text>}
            </div>
            {secondary && <Text variant="caption" margin="none" style={{ marginLeft: 18 }}>{secondary}</Text>}
            {env.commitMessage && (
                <Text
                    variant="caption"
                    margin="none"
                    data-testid="commit-subject"
                    style={{
                        marginLeft: 18,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        opacity: 0.75
                    }}
                >
                    {env.commitMessage}
                </Text>
            )}
        </div>
    );
}

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health } = service;
    const colorKey = combineSeverity(deploy.state, health.state);
    const showMetrics = health.state !== 'unknown';
    return (
        <div style={{
            background: cardTint(colorKey), borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 10, minHeight: 0
        }}>
            <Heading as="h3" variant="title-1" margin="none" style={{ fontSize: 30 }}>{service.name}</Heading>
            {deploy.environments.map((env) => <EnvRow key={env.env} env={env} now={now} />)}
            {showMetrics && (
                <Text variant="caption" margin="none">
                    {`p95 ${formatMs(health.p95Ms)} · 5xx ${formatPct(health.errorRate5xx)} · 4xx ${formatPct(health.errorRate4xx)}`}
                </Text>
            )}
        </div>
    );
}
