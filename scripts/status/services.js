export const SERVICES = [
    {
        name: 'products-api', repo: 'entur/products-api', deployWorkflowNames: ['cd'], branch: 'main',
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-api' }
    },
    {
        name: 'products-spring', repo: 'entur/products-spring', deployWorkflowNames: ['cd'], branch: 'main',
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-spring' }
    },
    {
        name: 'distribution-channels-api', repo: 'entur/distribution-channels-api', deployWorkflowNames: ['cd'], branch: 'main',
        metricsProject: 'ent-distchapi-prd', metricsSelector: { namespace: 'distribution-channels-api' }
    }
];
