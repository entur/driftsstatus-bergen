// scripts/collect-status.mjs (erstatt hele filen)
import { writeFile } from 'node:fs/promises';
import { SERVICES } from './status/services.js';
import { buildStatusJson } from './status/buildStatus.js';
import { fetchMetrics, UNKNOWN_HEALTH } from './status/metrics.js';

const GH_API = 'https://api.github.com';
const token = process.env.GH_TOKEN;
const gcpToken = process.env.GCP_TOKEN;

const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
};

async function ghJson(path) {
    const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
    return res.json();
}

const deployFetchers = {
    async listDeployments(repo, env) {
        const arr = await ghJson(`/repos/${repo}/deployments?environment=${env}&per_page=10`);
        return arr.map((d) => ({ id: d.id, sha: d.sha, created_at: d.created_at }));
    },
    async getStatus(repo, id) {
        const arr = await ghJson(`/repos/${repo}/deployments/${id}/statuses?per_page=1`);
        const s = arr[0];
        return s ? { state: s.state, at: s.created_at, url: s.log_url || s.target_url } : null;
    },
    async getCommitMessage(repo, sha) {
        const c = await ghJson(`/repos/${repo}/commits/${sha}`);
        return c.commit?.message ?? null;
    }
};

async function queryPrometheus(project, promql) {
    const url = `https://monitoring.googleapis.com/v1/projects/${project}/location/global/prometheus/api/v1/query`;
    const res = await fetch(`${url}?query=${encodeURIComponent(promql)}`, {
        headers: { Authorization: `Bearer ${gcpToken}` }
    });
    if (!res.ok) throw new Error(`GMP ${res.status} for ${project}`);
    return res.json();
}

async function main() {
    if (!token) {
        console.warn('GH_TOKEN mangler — deploy-status blir "unknown" for alle tjenester.');
    }
    const fetchHealth = gcpToken
        ? (svc) => fetchMetrics(svc, queryPrometheus)
        : async () => ({ ...UNKNOWN_HEALTH });
    if (!gcpToken) {
        console.warn('GCP_TOKEN mangler — helse blir "unknown" for alle tjenester.');
    }

    const outputPath = process.env.STATUS_OUTPUT || 'status.json';
    const status = await buildStatusJson(SERVICES, deployFetchers, fetchHealth, new Date().toISOString());
    await writeFile(outputPath, JSON.stringify(status, null, 2));
    console.log(`Skrev ${outputPath} med ${status.services.length} tjenester.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
