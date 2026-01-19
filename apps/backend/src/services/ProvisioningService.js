import { db } from "../db/index.js";
import crypto from "crypto";

export class ProvisioningService {
    /**
     * Provisions a managed SurrealDB instance (Namespace + Database + User)
     * on the existing Pegasus infrastructure.
     */
    async provisionManagedInstance(userId, nickname) {
        try {
            // 1. Generate unique identifiers
            const safeName = nickname.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const uniqueId = crypto.randomBytes(4).toString('hex');
            const nsName = `user_${userId.replace(/:/g, '_')}_${safeName}_${uniqueId}`;
            const dbName = 'main';
            const username = 'admin';
            const password = crypto.randomBytes(12).toString('hex');

            console.log(`[Provisioning] Creating managed instance: NS=${nsName}, DB=${dbName}`);

            // 2. Define Namespace (Requires Root access)
            await db.query(`DEFINE NAMESPACE ${nsName}`);

            // 3. Define User on Namespace (Requires Root access)
            // Note: We use string injection carefully for names, but password as parameter if possible.
            // SurrealQL DEFINE USER handles parameters for PASSWORD.
            await db.query(`
                USE NS ${nsName};
                DEFINE USER ${username} ON NAMESPACE PASSWORD $pass ROLES OWNER;
                DEFINE DATABASE ${dbName};
            `, { pass: password });

            // 4. Construct connection config
            // We use the same host/port as Pegasus but different credentials
            const pegasusUrl = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc';

            // Extract host/port/protocol from pegasusUrl
            const urlMatch = pegasusUrl.match(/^(ws|http|wss|https):\/\/(.+):(\d+)/i);
            const protocol = urlMatch ? urlMatch[1] : 'ws';
            const host = urlMatch ? urlMatch[2] : '127.0.0.1';
            const port = urlMatch ? parseInt(urlMatch[3]) : 8000;

            const config = {
                protocol,
                host,
                port,
                namespace: nsName,
                database: dbName,
                username: username,
                password: password,
                url: pegasusUrl // Keep the full URL for easy connection
            };

            return {
                ok: true,
                ns: nsName,
                db: dbName,
                credentials: { username, password },
                config
            };
        } catch (e) {
            console.error('[Provisioning] Failed to provision managed instance:', e);
            throw new Error(`Provisioning failed: ${e.message}`);
        }
    }

    getGuides() {
        return {
            local: {
                title: "Local Docker Setup",
                command: "docker run --rm -p 8000:8000 surrealdb/surrealdb:latest start --user root --pass root",
                description: "Run this command to start a fresh SurrealDB instance on your machine."
            },
            azure: {
                title: "Azure CLI Guide",
                command: "az container create --resource-group PegasusSurreal --name surreal-db --image surrealdb/surrealdb:latest --dns-name-label surreal-pegasus --ports 8000 --command-line \"start --user root --pass root --bind 0.0.0.0:8000\"",
                description: "Manually deploy a serverless SurrealDB instance to Azure Container Instances."
            },
            azure_auto: {
                title: "Azure Automation",
                description: "Let Pegasus automatically provision and manage your Azure SurrealDB instances using the Azure SDK."
            },
            aws: {
                title: "AWS ECS Guide",
                command: "aws ecs run-task --cluster default --task-definition surrealdb --launch-type FARGATE --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxxx],assignPublicIp=ENABLED}'",
                description: "Manually run a SurrealDB task on AWS ECS Fargate using the AWS CLI."
            },
            cloud: {
                title: "Surreal Cloud",
                url: "https://surrealdb.com/cloud",
                description: "Sign up for managed SurrealDB cloud hosting."
            }
        };
    }
}

export const provisioningService = new ProvisioningService();
