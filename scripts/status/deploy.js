export function selectDeployRun(runs, workflowNames) {
    const matching = runs.filter((r) => workflowNames.includes(r.name));
    if (matching.length === 0) return null;
    return matching.reduce((newest, r) =>
        new Date(r.run_started_at) > new Date(newest.run_started_at) ? r : newest
    );
}

export function mapDeployState(run) {
    if (run.status !== 'completed') return 'in_progress';
    return run.conclusion === 'success' ? 'success' : 'failure';
}

export function buildDeploy(run, repo) {
    if (!run) {
        return { state: 'unknown', sha: null, at: null, url: `https://github.com/${repo}/actions`, version: null };
    }
    return {
        state: mapDeployState(run),
        sha: run.head_sha.slice(0, 7),
        at: run.run_started_at,
        url: run.html_url,
        version: null
    };
}
