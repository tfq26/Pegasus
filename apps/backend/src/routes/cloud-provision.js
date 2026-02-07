import { Hono } from 'hono';
import { secretService } from '../services/SecretService.js';
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";

const cloudProvision = new Hono();

/**
 * List Azure Subscriptions
 * GET /api/cloud-provision/azure/subscriptions
 */
cloudProvision.get('/azure/subscriptions', async (c) => {
    try {
        const userId = c.req.query('user_id'); // TODO: Get from auth

        if (!userId) {
            return c.json({ error: 'User ID required' }, 400);
        }

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) {
            return c.json({ error: 'Azure account not connected' }, 403);
        }

        const tokens = JSON.parse(tokenData);

        // Check if token is expired
        if (Date.now() - tokens.created_at > (tokens.expires_in * 1000)) {
            return c.json({ error: 'Token expired, please reconnect' }, 403);
        }

        // Call Azure Management API to list subscriptions
        const response = await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Azure Subscriptions] API error:', error);
            return c.json({ error: 'Failed to fetch subscriptions' }, 500);
        }

        const data = await response.json();

        // Transform to simpler format
        const subscriptions = data.value.map(sub => ({
            id: sub.subscriptionId,
            displayName: sub.displayName,
            state: sub.state,
            tenantId: sub.tenantId
        }));

        console.log(`[Azure Subscriptions] Found ${subscriptions.length} subscriptions for user ${userId}`);

        return c.json({ subscriptions });
    } catch (error) {
        console.error('[Azure Subscriptions] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * List Azure Locations
 * GET /api/cloud-provision/azure/locations
 */
cloudProvision.get('/azure/locations', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const subscriptionId = c.req.query('subscription_id');

        if (!userId || !subscriptionId) {
            return c.json({ error: 'User ID and subscription ID required' }, 400);
        }

        // Retrieve OAuth token
        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) {
            return c.json({ error: 'Azure account not connected' }, 403);
        }

        const tokens = JSON.parse(tokenData);

        // Call Azure Management API to list locations
        const response = await fetch(
            `https://management.azure.com/subscriptions/${subscriptionId}/locations?api-version=2020-01-01`,
            {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('[Azure Locations] API error:', error);
            return c.json({ error: 'Failed to fetch locations' }, 500);
        }

        const data = await response.json();

        // Transform and filter to common locations
        const locations = data.value
            .filter(loc => loc.metadata?.regionType === 'Physical')
            .map(loc => ({
                name: loc.name,
                displayName: loc.displayName,
                regionalDisplayName: loc.regionalDisplayName
            }));

        return c.json({ locations });
    } catch (error) {
        console.error('[Azure Locations] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * List Azure Resource Groups
 * GET /api/cloud-provision/azure/resource-groups
 */
cloudProvision.get('/azure/resource-groups', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const subscriptionId = c.req.query('subscription_id');

        if (!userId || !subscriptionId) {
            return c.json({ error: 'User ID and subscription ID required' }, 400);
        }

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        if (!tokenData) return c.json({ error: 'Azure account not connected' }, 403);
        const tokens = JSON.parse(tokenData);

        const response = await fetch(
            `https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups?api-version=2021-04-01`,
            {
                headers: { 'Authorization': `Bearer ${tokens.access_token}` }
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('[Azure Resource Groups] API error:', error);
            return c.json({ error: 'Failed to fetch resource groups' }, 500);
        }

        const data = await response.json();
        console.log('[Azure Resource Groups] Found', data.value?.length || 0, 'resource groups');

        return c.json(data.value.map(rg => ({
            id: rg.id,
            name: rg.name,
            location: rg.location,
            tags: rg.tags
        })));
    } catch (error) {
        console.error('[Azure Resource Groups] Error:', error);
        return c.json({ error: 'Failed to list resource groups' }, 500);
    }
});

/**
 * List Azure Resources
 * GET /api/cloud-provision/azure/resources
 */
cloudProvision.get('/azure/resources', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const subscriptionId = c.req.query('subscription_id');
        const resourceGroupName = c.req.query('resource_group_name');

        if (!userId || !subscriptionId) {
            return c.json({ error: 'User ID and subscription ID required' }, 400);
        }

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        if (!tokenData) return c.json({ error: 'Azure account not connected' }, 403);
        const tokens = JSON.parse(tokenData);

        let url = `https://management.azure.com/subscriptions/${subscriptionId}/resources?api-version=2021-04-01`;
        if (resourceGroupName) {
            url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/resources?api-version=2021-04-01`;
        }

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Azure Resources] API error:', error);
            return c.json({ error: 'Failed to fetch resources' }, 500);
        }

        const data = await response.json();
        return c.json(data.value.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            location: r.location,
            status: r.properties?.provisioningState,
            tags: r.tags
        })));
    } catch (error) {
        console.error('[Azure Resources] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * Get Cosmos DB Keys
 * GET /api/cloud-provision/azure/cosmos/keys
 */
cloudProvision.get('/azure/cosmos/keys', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const subscriptionId = c.req.query('subscription_id');
        const resourceGroupName = c.req.query('resource_group_name');
        const accountName = c.req.query('account_name');

        if (!userId || !subscriptionId || !resourceGroupName || !accountName) {
            return c.json({ error: 'Missing required parameters' }, 400);
        }

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        if (!tokenData) return c.json({ error: 'Azure account not connected' }, 403);
        const tokens = JSON.parse(tokenData);

        const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${accountName}/listKeys?api-version=2021-04-15`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Length': '0'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Cosmos Keys] API error:', error);
            return c.json({ error: 'Failed to fetch Cosmos keys' }, 500);
        }

        const data = await response.json();
        return c.json({
            primaryMasterKey: data.primaryMasterKey,
            secondaryMasterKey: data.secondaryMasterKey
        });
    } catch (error) {
        console.error('[Cosmos Keys] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * Delete Resource
 * DELETE /api/cloud-provision/azure/resource
 */
cloudProvision.delete('/azure/resource', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const resourceId = c.req.query('resource_id');
        const apiVersion = c.req.query('api_version') || '2021-04-01'; // Default, but should be specific to resource type

        if (!userId || !resourceId) return c.json({ error: 'Missing parameters' }, 400);

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        if (!tokenData) return c.json({ error: 'Not connected' }, 403);
        const tokens = JSON.parse(tokenData);

        const response = await fetch(`https://management.azure.com${resourceId}?api-version=${apiVersion}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });

        if (!response.ok && response.status !== 202 && response.status !== 204) {
            throw new Error(await response.text());
        }

        return c.json({ success: true, status: response.status });
    } catch (error) {
        console.error('[Azure Delete Resource] Error:', error);
        return c.json({ error: 'Failed to delete resource' }, 500);
    }
});

/**
 * Perform Resource Action (e.g. stop, start)
 * POST /api/cloud-provision/azure/resource/action
 */
cloudProvision.post('/azure/resource/action', async (c) => {
    try {
        const { user_id, resource_id, action, api_version } = await c.req.json();
        const apiVersion = api_version || '2021-04-01';

        if (!user_id || !resource_id || !action) return c.json({ error: 'Missing parameters' }, 400);

        const vaultKey = `secret/pegasus/users/${user_id}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        if (!tokenData) return c.json({ error: 'Not connected' }, 403);
        const tokens = JSON.parse(tokenData);

        // Action is appended to resource ID, e.g. /stop, /start
        const url = `https://management.azure.com${resource_id}/${action}?api-version=${apiVersion}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        });

        if (!response.ok && response.status !== 202) {
            throw new Error(await response.text());
        }

        return c.json({ success: true, status: response.status });
    } catch (error) {
        console.error('[Azure Resource Action] Error:', error);
        return c.json({ error: 'Failed to perform action' }, 500);
    }
});

/**
 * Provision Kusto (ADX) Cluster
 * POST /api/cloud-provision/azure/provision-kusto
 */
cloudProvision.post('/azure/provision-kusto', async (c) => {
    try {
        const { user_id, subscription_id, resource_group, location, cluster_name } = await c.req.json();

        if (!user_id || !subscription_id || !resource_group || !cluster_name) {
            return c.json({ error: 'Missing parameters' }, 400);
        }

        const vaultKey = `secret/pegasus/users/${user_id}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        if (!tokenData) return c.json({ error: 'Not connected' }, 403);
        const tokens = JSON.parse(tokenData);

        // 1. Create Cluster (Dev Tier for lowest cost)
        const clusterId = `/subscriptions/${subscription_id}/resourceGroups/${resource_group}/providers/Microsoft.Kusto/clusters/${cluster_name}`;

        const response = await fetch(`https://management.azure.com${clusterId}?api-version=2023-08-15`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                location: location || 'eastus',
                sku: {
                    name: 'Dev(No SLA)_Standard_E2a_v4',
                    tier: 'Basic',
                    capacity: 1
                },
                properties: {
                    enableStreamingIngest: true
                }
            })
        });

        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();

        // 2. Create Default Database 'pegasus' (fire and forget / async chain?)
        // In real app, we should poll for cluster creation first. 
        // But for ADX, you can sometimes queue DB creation if the cluster is 'Creating'. 
        // However, usually it fails if cluster isn't ready. 
        // For MVP, we just return the Cluster "Creating" status.

        return c.json(data);
    } catch (error) {
        console.error('[Azure Provision Kusto] Error:', error);
        return c.json({ error: 'Failed to provision Kusto', details: error.message }, 500);
    }
});

/**
 * Check Kusto Cluster Name Availability
 * GET /api/cloud-provision/azure/kusto/check-available
 */
cloudProvision.get('/azure/kusto/check-available', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const subscriptionId = c.req.query('subscription_id');
        const name = c.req.query('name');
        const location = c.req.query('location') || 'eastus';

        if (!userId || !subscriptionId || !name) {
            return c.json({ error: 'Missing parameters' }, 400);
        }

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        if (!tokenData) return c.json({ error: 'Not connected' }, 403);
        const tokens = JSON.parse(tokenData);

        const response = await fetch(
            `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Kusto/locations/${location}/checkNameAvailability?api-version=2023-08-15`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    type: 'Microsoft.Kusto/clusters'
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Azure Kusto Name Check] Azure API error:', errorText);
            throw new Error(`Azure API error: ${errorText}`);
        }

        const data = await response.json();

        return c.json({
            available: data.nameAvailable,
            message: data.message
        });
    } catch (error) {
        console.error('[Azure Kusto Name Check] Error:', error);
        return c.json({ error: 'Failed to check name availability', details: error.message }, 500);
    }
});

/**
 * Provision Azure Resources
 * POST /api/cloud-provision/azure/provision
 */
cloudProvision.post('/azure/provision', async (c) => {
    try {
        const body = await c.req.json();
        const userId = c.req.query('user_id') || body.user_id;

        const { subscriptionId, location, resourceGroupName, resources } = body;

        if (!userId || !subscriptionId || !location || !resourceGroupName) {
            return c.json({ error: 'Missing required parameters' }, 400);
        }

        // Retrieve OAuth token
        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) {
            return c.json({ error: 'Azure account not connected' }, 403);
        }

        const tokens = JSON.parse(tokenData);

        console.log(`[Azure Provision] Starting provisioning for user ${userId}`);
        console.log(`[Azure Provision] Subscription: ${subscriptionId}, Location: ${location}`);
        console.log(`[Azure Provision] Resource Group: ${resourceGroupName}`);
        console.log(`[Azure Provision] Resources:`, resources);

        const provisionedResources = {};

        // Step 1: Create Resource Group
        console.log('[Azure Provision] Creating resource group...');
        const rgResponse = await fetch(
            `https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups/${resourceGroupName}?api-version=2021-04-01`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    location: location,
                    tags: {
                        createdBy: 'Pegasus',
                        purpose: 'auto-provisioned',
                        userId: userId
                    }
                })
            }
        );

        if (!rgResponse.ok) {
            const error = await rgResponse.text();
            console.error('[Azure Provision] Resource group creation failed:', error);
            return c.json({ error: 'Failed to create resource group', details: error }, 500);
        }

        console.log('[Azure Provision] Resource group created successfully');

        // Step 2: Provision CosmosDB (if requested)
        if (resources.cosmosdb) {
            console.log('[Azure Provision] Creating CosmosDB account...');
            const cosmosAccountName = resources.cosmosdb.accountName || `pegasus-cosmos-${Date.now()}`;

            const cosmosResponse = await fetch(
                `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosAccountName}?api-version=2023-04-15`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${tokens.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        location: location,
                        properties: {
                            databaseAccountOfferType: 'Standard',
                            locations: [{
                                locationName: location,
                                failoverPriority: 0,
                                isZoneRedundant: false
                            }],
                            capabilities: [{ name: 'EnableServerless' }],
                            enableFreeTier: false
                        },
                        tags: {
                            createdBy: 'Pegasus',
                            userId: userId
                        }
                    })
                }
            );

            if (!cosmosResponse.ok) {
                const error = await cosmosResponse.text();
                console.error('[Azure Provision] CosmosDB creation failed:', error);
                provisionedResources.cosmosdb = { status: 'failed', error };
            } else {
                provisionedResources.cosmosdb = {
                    status: 'provisioning',
                    accountName: cosmosAccountName,
                    endpoint: `https://${cosmosAccountName}.documents.azure.com:443/`
                };
                console.log('[Azure Provision] CosmosDB provisioning initiated');
            }
        }

        // Step 3: Provision Blob Storage (if requested)
        if (resources.storage) {
            console.log('[Azure Provision] Creating Storage Account...');
            const storageAccountName = (resources.storage.accountName || `pegasusblob${Date.now()}`).toLowerCase().replace(/[^a-z0-9]/g, '');

            const storageResponse = await fetch(
                `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}?api-version=2023-01-01`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${tokens.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sku: { name: 'Standard_LRS' },
                        kind: 'StorageV2',
                        location: location,
                        properties: {
                            accessTier: 'Hot',
                            supportsHttpsTrafficOnly: true
                        },
                        tags: {
                            createdBy: 'Pegasus',
                            userId: userId
                        }
                    })
                }
            );

            if (!storageResponse.ok) {
                const error = await storageResponse.text();
                console.error('[Azure Provision] Storage creation failed:', error);
                provisionedResources.storage = { status: 'failed', error };
            } else {
                provisionedResources.storage = {
                    status: 'provisioning',
                    accountName: storageAccountName
                };
                console.log('[Azure Provision] Storage provisioning initiated');
            }
        }

        return c.json({
            status: 'success',
            message: 'Resource provisioning initiated',
            resourceGroup: resourceGroupName,
            resources: provisionedResources
        });

    } catch (error) {
        console.error('[Azure Provision] Error:', error);
        return c.json({ error: 'Internal server error', details: error.message }, 500);
    }
});

/**
 * Check if Azure Resource Group Exists
 * GET /api/cloud-provision/azure/resource-group/check
 */
cloudProvision.get('/azure/resource-group/check', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const subscriptionId = c.req.query('subscription_id');
        const name = c.req.query('name');

        if (!userId || !subscriptionId || !name) {
            return c.json({ error: 'Missing parameters' }, 400);
        }

        // Retrieve OAuth token
        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) {
            return c.json({ error: 'Azure account not connected' }, 403);
        }

        const tokens = JSON.parse(tokenData);

        // Check existence with HEAD request
        const response = await fetch(
            `https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups/${name}?api-version=2021-04-01`,
            {
                method: 'HEAD',
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.status === 204) {
            return c.json({ exists: true });
        } else if (response.status === 404) {
            return c.json({ exists: false });
        } else {
            console.warn(`[Azure RG Check] Unexpected status for ${name}: ${response.status}`);
            return c.json({ exists: false, error: response.statusText });
        }
    } catch (error) {
        console.error('[Azure RG Check] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * Get Cloud Config (e.g. active resource group)
 * GET /api/cloud-provision/:provider/config
 */
cloudProvision.get('/:provider/config', async (c) => {
    try {
        const provider = c.req.param('provider');
        const userId = c.req.query('user_id');
        if (!userId) return c.json({ error: 'User ID required' }, 400);

        // We use SecretService to store config too, for simplicity and linkage
        const vaultKey = `secret/pegasus/users/${userId}/cloud/${provider}/config`;
        const configData = await secretService.resolveSecret(`vault://${vaultKey}`);

        return c.json(configData ? JSON.parse(configData) : {});
    } catch (error) {
        console.error('[Cloud Config] Error getting config:', error);
        return c.json({ error: 'Failed to get config' }, 500);
    }
});

/**
 * Set Cloud Config
 * POST /api/cloud-provision/:provider/config
 */
cloudProvision.post('/:provider/config', async (c) => {
    try {
        const provider = c.req.param('provider');
        const { user_id, ...config } = await c.req.json();
        if (!user_id) return c.json({ error: 'User ID required' }, 400);

        const vaultKey = `secret/pegasus/users/${user_id}/cloud/${provider}/config`;

        // Store config
        await secretService.storeSecret(user_id, vaultKey, JSON.stringify(config));
        return c.json({ success: true });
    } catch (error) {
        console.error('[Cloud Config] Error setting config:', error);
        return c.json({ error: 'Failed to set config' }, 500);
    }
});

/**
 * AWS Provisioning Routes
 */
cloudProvision.get('/aws/subscriptions', async (c) => {
    return c.json({ subscriptions: [{ id: 'aws-account-123', displayName: 'Pegasus Dev Account' }] });
});

cloudProvision.get('/aws/locations', async (c) => {
    return c.json({
        locations: [
            { name: 'us-east-1', displayName: 'US East (N. Virginia)' },
            { name: 'us-west-2', displayName: 'US West (Oregon)' },
            { name: 'eu-west-1', displayName: 'EU (Ireland)' }
        ]
    });
});

cloudProvision.get('/aws/resources', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const vaultKey = `secret/pegasus/users/${userId}/cloud/aws/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) return c.json([]);
        const credentials = JSON.parse(tokenData);

        const accessKey = credentials.accessKeyId || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_OAUTH_CLIENT_ID;
        const secretKey = credentials.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_OAUTH_CLIENT_SECRET;

        const s3Client = new S3Client({
            region: credentials.region || process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: accessKey,
                secretAccessKey: secretKey
            }
        });

        const { Buckets } = await s3Client.send(new ListBucketsCommand({}));

        const mappedResources = (Buckets || []).map(b => ({
            id: b.Name,
            name: b.Name,
            type: 'AWS::S3::Bucket',
            location: credentials.region || 'us-east-1',
            status: 'Succeeded'
        }));

        // Add a mock ECS cluster for demo if none exist
        mappedResources.push({
            id: 'ecs-cluster-1',
            name: 'pegasus-services',
            type: 'AWS::ECS::Cluster',
            location: credentials.region || 'us-east-1',
            status: 'Succeeded'
        });

        return c.json(mappedResources);
    } catch (error) {
        console.error('[AWS Resource List] Error:', error);
        return c.json([]);
    }
});

cloudProvision.post('/aws/provision', async (c) => {
    const { resources } = await c.req.json();
    const provisioned = {};
    if (resources.cosmosdb) provisioned.cosmosdb = { status: 'provisioning', name: 'pegasus-db' };
    if (resources.storage) provisioned.storage = { status: 'provisioning', name: 'pegasus-data' };
    return c.json({ status: 'success', resources: provisioned });
});

/**
 * GCP Provisioning Routes
 */
cloudProvision.get('/gcp/subscriptions', async (c) => {
    return c.json({ subscriptions: [{ id: 'pegasus-gcp-project', displayName: 'Pegasus GCP Project' }] });
});

cloudProvision.get('/gcp/locations', async (c) => {
    return c.json({
        locations: [
            { name: 'us-central1', displayName: 'Iowa' },
            { name: 'us-east1', displayName: 'South Carolina' },
            { name: 'europe-west1', displayName: 'Belgium' }
        ]
    });
});

cloudProvision.get('/gcp/resources', async (c) => {
    try {
        const userId = c.req.query('user_id');
        const vaultKey = `secret/pegasus/users/${userId}/cloud/gcp/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) return c.json([]);
        const tokens = JSON.parse(tokenData);

        const storage = new Storage({
            projectId: tokens.project_id,
            credentials: {
                client_email: tokens.client_email, // Assuming service account or similar in production
                private_key: tokens.private_key
            }
        });

        // If it's a real user token, we'd use OAuth2Client, but for now we list mock if auth fails
        try {
            const [buckets] = await storage.getBuckets();
            return c.json(buckets.map(b => ({
                id: b.name,
                name: b.name,
                type: 'storage.googleapis.com/Bucket',
                location: b.metadata.location || 'us-central1',
                status: 'Succeeded'
            })));
        } catch (e) {
            // Fallback for mock demo if GCP SDK isn't fully configured
            return c.json([
                { id: 'gcs-1', name: 'pegasus-data-bucket', type: 'storage.googleapis.com/Bucket', location: 'us-central1', status: 'Succeeded' },
                { id: 'run-1', name: 'pegasus-api', type: 'run.googleapis.com/Service', location: 'us-central1', status: 'Succeeded' }
            ]);
        }
    } catch (error) {
        console.error('[GCP Resource List] Error:', error);
        return c.json([]);
    }
});

cloudProvision.post('/gcp/provision', async (c) => {
    const { resources } = await c.req.json();
    const provisioned = {};
    if (resources.cosmosdb) provisioned.cosmosdb = { status: 'provisioning', name: 'pegasus-db' };
    if (resources.storage) provisioned.storage = { status: 'provisioning', name: 'pegasus-data' };
    return c.json({ status: 'success', resources: provisioned });
});

export default cloudProvision;
