const IN_PROGRESS = ['in_progress', 'queued', 'pending'];
const FAILURE = ['failure', 'error', 'inactive'];

export function mapDeploymentState(githubState) {
    if (githubState === 'success') return 'success';
    if (IN_PROGRESS.includes(githubState)) return 'in_progress';
    if (FAILURE.includes(githubState)) return 'failure';
    return 'unknown';
}

export function selectLatestDeployment(entries) {
    for (const e of entries) {
        if (e.statusState && e.statusState !== 'waiting') return e;
    }
    return null;
}

const firstLine = (msg) => (msg ?? '').split('\n')[0];

export function extractTicket(message) {
    const m = firstLine(message).match(/ETU-\d+/i);
    return m ? m[0].toUpperCase() : null;
}

export function extractPr(message) {
    const m = firstLine(message).match(/#(\d+)/);
    return m ? Number(m[1]) : null;
}

export function buildDeployEnvironment({ env, sha, at, statusState, commitMessage, url, repo }) {
    if (!sha) {
        return { env, state: 'unknown', sha: null, at: null, ticket: null, pr: null, url: `https://github.com/${repo}/deployments` };
    }
    return {
        env,
        state: mapDeploymentState(statusState),
        sha: sha.slice(0, 7),
        at: at ?? null,
        ticket: extractTicket(commitMessage),
        pr: extractPr(commitMessage),
        url: url || `https://github.com/${repo}/deployments`
    };
}

const ENV_ORDER = ['prd', 'tst', 'dev'];

export function buildDeploy(environments) {
    const sorted = [...environments].sort(
        (a, b) => ENV_ORDER.indexOf(a.env) - ENV_ORDER.indexOf(b.env)
    );
    const prd = sorted.find((e) => e.env === 'prd');
    return { state: prd ? prd.state : 'unknown', environments: sorted };
}

export async function fetchDeployEnvironments(service, fetchers) {
    const envs = service.environments ?? ['dev', 'tst', 'prd'];
    const results = await Promise.all(envs.map(async (env) => {
        try {
            const deployments = await fetchers.listDeployments(service.repo, env);
            const entries = [];
            for (const d of deployments) {
                const status = await fetchers.getStatus(service.repo, d.id);
                entries.push({
                    deployment: d,
                    statusState: status?.state ?? null,
                    statusAt: status?.at ?? null,
                    statusUrl: status?.url ?? null
                });
                if (status && status.state !== 'waiting') break;
            }
            const chosen = selectLatestDeployment(entries);
            if (!chosen) return buildDeployEnvironment({ env, sha: null, repo: service.repo });
            const commitMessage = await fetchers.getCommitMessage(service.repo, chosen.deployment.sha);
            return buildDeployEnvironment({
                env,
                sha: chosen.deployment.sha,
                at: chosen.statusAt ?? chosen.deployment.created_at,
                statusState: chosen.statusState,
                commitMessage,
                url: chosen.statusUrl,
                repo: service.repo
            });
        } catch {
            return buildDeployEnvironment({ env, sha: null, repo: service.repo });
        }
    }));
    return buildDeploy(results);
}
