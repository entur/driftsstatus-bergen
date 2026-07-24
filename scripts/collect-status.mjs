import { writeFile } from 'node:fs/promises';
import { SERVICES } from './status/services.js';
import { buildStatusJson } from './status/buildStatus.js';
import { fetchMetrics, UNKNOWN_HEALTH } from './status/metrics.js';

const GH_API = 'https://api.github.com';
const token = process.env.GH_TOKEN;
const gcpToken = process.env.GCP_TOKEN;

async function fetchRuns(repo, branch) {
    // per_page=100 (maks GitHub tillater) for å redusere sjansen for at siste
    // relevante run faller utenfor sida på et travelt repo med mange workflows.
    const url = `${GH_API}/repos/${repo}/actions/runs?branch=${branch}&per_page=100`;
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}`);
    const body = await res.json();
    return body.workflow_runs ?? [];
}

async function queryPrometheus(project, promql) {
    const url = `https://monitoring.googleapis.com/v1/projects/${project}/location/global/prometheus/api/v1/query`;
    const res = await fetch(`${url}?query=${encodeURIComponent(promql)}`, {
        headers: { Authorization: `Bearer ${gcpToken}` },
        signal: AbortSignal.timeout(10000)
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
    const status = await buildStatusJson(SERVICES, fetchRuns, fetchHealth, new Date().toISOString());
    await writeFile(outputPath, JSON.stringify(status, null, 2));
    console.log(`Skrev ${outputPath} med ${status.services.length} tjenester.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
