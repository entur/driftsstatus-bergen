import React from 'react';
import { Heading, Text } from '@entur/typography/beta';
import { HeartIcon, UploadIcon } from '@entur/icons';
import PieChart from './PieChart.jsx';
import {
    dotColor, cardTint, prdColorKey, healthColorKey, deployColorKey,
    pickMetric, responseBreakdown, formatUptime15m, formatMs,
    envStateLabel, timeAgo, hasCompleteHeroData
} from '../lib/statusFormat.js';

function Heartbeat({ health }) {
    const color = dotColor(healthColorKey(health?.state));
    const label = health?.up === true ? 'Oppe' : health?.up === false ? 'Nede' : '–';
    const uptime = health?.uptime15m === null || health?.uptime15m === undefined
        ? 'oppetid ukjent siste 15 min'
        : `${formatUptime15m(health.uptime15m)} oppe siste 15 min`;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span data-testid="heart" style={{ color, display: 'flex' }}>
                <HeartIcon size={34} color={color} />
            </span>
            <div>
                <Text variant="body" margin="none" style={{ fontWeight: 800, fontSize: 18, color }}>{label}</Text>
                <Text variant="caption" margin="none" style={{ opacity: 0.8 }}>{uptime}</Text>
            </div>
        </div>
    );
}

function ResponseTime({ metrics }) {
    const avg = pickMetric(metrics, 'avgMs');
    return (
        <div>
            <Text variant="caption" margin="none" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7 }}>Snitt responstid</Text>
            <Text variant="body" margin="none" style={{ fontWeight: 800, fontSize: 22 }}>{formatMs(avg)}</Text>
        </div>
    );
}

function Legend() {
    const item = (color, label) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />{label}
        </span>
    );
    return (
        <div style={{ display: 'flex', gap: 14, fontSize: 12, opacity: 0.8 }}>
            {item(dotColor('success'), '2xx')}
            {item(dotColor('warning'), '4xx')}
            {item(dotColor('negative'), '5xx')}
        </div>
    );
}

function DeploySection({ env, now }) {
    const secondary = env.state === 'success' ? `Deployet ${timeAgo(env.at, now)}` : envStateLabel(env.state);
    return (
        <div data-testid="deploy" style={{ borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UploadIcon size={20} color={dotColor(deployColorKey(env.state))} />
                {env.sha && <Text variant="body" margin="none" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{env.sha}</Text>}
                {secondary && <Text variant="body" margin="none" style={{ opacity: 0.85 }}>{secondary}</Text>}
            </div>
            {env.commitMessage && (
                <Text
                    variant="caption"
                    margin="none"
                    data-testid="commit-subject"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.75 }}
                >
                    {env.commitMessage}
                </Text>
            )}
        </div>
    );
}

function SheepPlaceholder() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <img src="/sheep.svg" alt="" width={130} height={130} style={{ maxWidth: '100%', height: 'auto' }} />
            <Text variant="body" margin="none" style={{ fontWeight: 600, opacity: 0.8 }}>Venter på data</Text>
        </div>
    );
}

export default function ServiceCard({ service, now = new Date() }) {
    const { deploy, health, metrics } = service;
    const prd = deploy.environments.find((e) => e.env === 'prd');
    return (
        <div style={{
            background: cardTint(prdColorKey(service)), borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', display: 'flex',
            flexDirection: 'column', gap: 12, minHeight: 0
        }}>
            <Heading as="h3" variant="title-1" margin="none" style={{ fontSize: 28 }}>{service.name}</Heading>
            {hasCompleteHeroData(service) ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <PieChart breakdown={responseBreakdown(metrics)} size={118} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                            <Heartbeat health={health} />
                            <ResponseTime metrics={metrics} />
                        </div>
                    </div>
                    <Legend />
                </>
            ) : (
                <SheepPlaceholder />
            )}
            {prd && <DeploySection env={prd} now={now} />}
        </div>
    );
}
