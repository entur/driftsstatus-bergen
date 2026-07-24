// NB: både metricsSelector.service og upSelector må verifiseres mot Grafana (Task 1) —
// `up`-metrikken bærer typisk ikke app-labelen `service`, derfor egen namespace-nivå upSelector.
export const SERVICES = [
    {
        name: 'products-api', repo: 'entur/products-api', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-api' }, upSelector: { namespace: 'products' }
    },
    {
        name: 'products-spring', repo: 'entur/products-spring', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-products-prd', metricsSelector: { namespace: 'products', service: 'products-spring' }, upSelector: { namespace: 'products' }
    },
    {
        name: 'distribution-channels-api', repo: 'entur/distribution-channels-api', environments: ['dev', 'tst', 'prd'],
        metricsProject: 'ent-distchapi-prd', metricsSelector: { namespace: 'distribution-channels-api' }, upSelector: { namespace: 'distribution-channels-api' }
    }
];
