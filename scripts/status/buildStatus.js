import { selectDeployRun, buildDeploy } from './deploy.js';
import { UNKNOWN_HEALTH } from './metrics.js';

export async function buildStatusJson(services, fetchRuns, fetchHealth, generatedAt) {
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
            let health;
            try {
                health = await fetchHealth(svc);
            } catch {
                health = { ...UNKNOWN_HEALTH };
            }
            return { name: svc.name, repo: svc.repo, deploy, health };
        })
    );
    return { generatedAt, services: results };
}
