import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance";
import { ClientSecretCredential } from "@azure/identity";

export class AzureProvisioner {
    /**
     * Provisions a SurrealDB Container Instance on the user's Azure subscription.
     */
    async provisionACI(credentials, config) {
        const { tenantId, clientId, clientSecret, subscriptionId } = credentials;
        const { resourceGroup, containerName, dnsLabel, location } = config;

        try {
            console.log(`[AzureProvisioner] Authenticating with TenantId: ${tenantId}, ClientId: ${clientId}`);

            const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
            const client = new ContainerInstanceManagementClient(credential, subscriptionId);

            console.log(`[AzureProvisioner] Starting deployment of ${containerName} in ${resourceGroup} (${location})...`);

            const deployment = await client.containerGroups.beginCreateOrUpdateAndWait(resourceGroup, containerName, {
                location: location || "eastus",
                containers: [
                    {
                        name: "surrealdb",
                        image: "surrealdb/surrealdb:latest",
                        resources: {
                            requests: {
                                cpu: 1.0,
                                memoryInGB: 1.5
                            }
                        },
                        ports: [{ port: 8000 }],
                        command: ["start", "--user", "root", "--pass", "root", "--bind", "0.0.0.0:8000"]
                    }
                ],
                osType: "Linux",
                ipAddress: {
                    type: "Public",
                    ports: [{ protocol: "TCP", port: 8000 }],
                    dnsNameLabel: dnsLabel || `surreal-${Math.random().toString(36).substring(7)}`
                },
                restartPolicy: "Always"
            });

            console.log(`[AzureProvisioner] Deployment successful! FQDN: ${deployment.ipAddress.fqdn}`);

            return {
                ok: true,
                fqdn: deployment.ipAddress.fqdn,
                ip: deployment.ipAddress.ip,
                config: {
                    protocol: 'ws',
                    host: deployment.ipAddress.fqdn,
                    port: 8000,
                    namespace: 'test',
                    database: 'test',
                    username: 'root',
                    password: 'root',
                    url: `ws://${deployment.ipAddress.fqdn}:8000/rpc`
                }
            };
        } catch (e) {
            console.error('[AzureProvisioner] Deployment failed:', e);
            throw new Error(`Azure deployment failed: ${e.message}`);
        }
    }
}

export const azureProvisioner = new AzureProvisioner();
