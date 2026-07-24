import { fetchDeployEnvironments } from './deployEnvironments.js';
import { UNKNOWN_HEALTH } from './metrics.js';

export async function buildStatusJson(services, deployFetchers, fetchHealth, generatedAt) {
    const results = await Promise.all(
        services.map(async (svc) => {
            let deploy;
            try {
                deploy = await fetchDeployEnvironments(svc, deployFetchers);
            } catch {
                deploy = { state: 'unknown', environments: [] };
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
