import { selectDeployRun, buildDeploy } from './deploy.js';

const UNKNOWN_HEALTH = { state: 'unknown', errorRate: null, p95Ms: null };

export async function buildStatusJson(services, fetchRuns, generatedAt) {
    const results = await Promise.all(
        services.map(async (svc) => {
            let deploy;
            try {
                const runs = await fetchRuns(svc.repo, svc.branch);
                const run = selectDeployRun(runs, svc.deployWorkflowNames);
                deploy = buildDeploy(run, svc.repo);
            } catch {
                deploy = buildDeploy(null, svc.repo);
            }
            return { name: svc.name, repo: svc.repo, deploy, health: { ...UNKNOWN_HEALTH } };
        })
    );
    return { generatedAt, services: results };
}
