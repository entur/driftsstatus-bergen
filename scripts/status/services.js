export const SERVICES = [
    {
        name: 'products-api', repo: 'entur/products-api', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-api' }
    },
    {
        name: 'products-spring', repo: 'entur/products-spring', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-spring' }
    },
    {
        name: 'distribution-channels-api', repo: 'entur/distribution-channels-api', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-distchapi-prd', metricsSelector: { namespace: 'distribution-channels-api' }
    }
];
