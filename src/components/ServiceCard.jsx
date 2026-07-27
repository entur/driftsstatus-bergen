import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { HeartIcon, LikeIcon, MeasureIcon } from '@entur/icons';
import {
    dotColor, cardTint, prdColorKey, healthColorKey, deployColorKey,
    successRate, metricColorKey, SUCCESS_RATE_THRESHOLDS, P95_THRESHOLDS,
    formatMs, formatPct, envStateLabel, timeAgo
} from '../lib/statusFormat.js';

function HealthIndicator({ Icon, value, colorKey }) {
    const color = dotColor(colorKey);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon size={26} color={color} />
            {value !== undefined && (
                <Text variant="body" margin="none" style={{ color, fontWeight: 700 }}>{value}</Text>
            )}
        </div>
    );
}

function HealthIndicatorRow({ health }) {
    const sr = successRate(health);
    return (
        <div data-testid="health-row" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <HealthIndicator Icon={HeartIcon} colorKey={healthColorKey(health.state)} />
            <HealthIndicator
                Icon={LikeIcon}
                value={sr === null ? '–' : formatPct(sr)}
                colorKey={metricColorKey(sr, SUCCESS_RATE_THRESHOLDS)}
            />
            <HealthIndicator
                Icon={MeasureIcon}
                value={formatMs(health.p95Ms)}
                colorKey={metricColorKey(health.p95Ms, P95_THRESHOLDS)}
            />
        </div>
    );
}

function ProdRow({ env, now }) {
    const secondary = env.state === 'success' ? `Deployet ${timeAgo(env.at, now)}` : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
                <Text variant="body" margin="none" style={{ fontWeight: 700, minWidth: 40, fontSize: 18 }}>PRD</Text>
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace', fontSize: 18 }}>{env.sha}</Text>}
            </div>
            {secondary && <Text variant="body" margin="none" style={{ marginLeft: 24, fontWeight: 600 }}>{secondary}</Text>}
            {env.commitMessage && (
                <Text
                    variant="caption"
                    margin="none"
                    data-testid="commit-subject"
                    style={{ marginLeft: 24, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.8 }}
                >
                    {env.commitMessage}
                </Text>
            )}
        </div>
    );
}

function CompactRow({ env, now }) {
    const secondary = env.state === 'success' ? timeAgo(env.at, now) : envStateLabel(env.state);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(deployColorKey(env.state)), flex: '0 0 auto' }} />
            <Text variant="caption" margin="none" style={{ fontWeight: 600, minWidth: 30 }}>{env.env.toUpperCase()}</Text>
            {env.sha && <Text variant="caption" margin="none" style={{ fontFamily: 'monospace' }}>{env.sha}</Text>}
            {secondary && <Text variant="caption" margin="none" style={{ opacity: 0.75 }}>{secondary}</Text>}
        </div>
    );
}

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health } = service;
    const prd = deploy.environments.find((e) => e.env === 'prd');
    const others = deploy.environments.filter((e) => e.env !== 'prd');
    return (
        <div style={{
            background: cardTint(prdColorKey(service)), borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 12, minHeight: 0
        }}>
            <Heading as="h3" variant="title-1" margin="none" style={{ fontSize: 30 }}>{service.name}</Heading>
            <HealthIndicatorRow health={health} />
            {prd && <ProdRow env={prd} now={now} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {others.map((env) => <CompactRow key={env.env} env={env} now={now} />)}
            </div>
        </div>
    );
}
