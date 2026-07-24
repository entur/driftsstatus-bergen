import { writeFile } from 'node:fs/promises';
import { SERVICES } from './status/services.js';
import { buildStatusJson } from './status/buildStatus.js';

const GH_API = 'https://api.github.com';
const token = process.env.GH_TOKEN;

async function fetchRuns(repo, branch) {
    const url = `${GH_API}/repos/${repo}/actions/runs?branch=${branch}&per_page=30`;
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

async function main() {
    if (!token) {
        console.warn('GH_TOKEN mangler — deploy-status blir "unknown" for alle tjenester.');
    }
    const status = await buildStatusJson(SERVICES, fetchRuns, new Date().toISOString());
    await writeFile('status.json', JSON.stringify(status, null, 2));
    console.log(`Skrev status.json med ${status.services.length} tjenester.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
