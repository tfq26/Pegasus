
import { CosmosClient } from "@azure/cosmos";

const endpoint = "https://pegasustestcosmos.documents.azure.com:443/";
const key = "6e7YfiXFO3ie77ZFj1FYlY5oVMgNLlliW27LfqLJRZSun0AXVkkMxTtqhIVWuLXPm9uieoDKdeKvACDbx7Wm4Q==";
const databaseId = "PegasusLive";
const containerId = "OrionMetrics";

const client = new CosmosClient({ endpoint, key });

async function checkAccuracy() {
    try {
        const database = client.database(databaseId);
        const container = database.container(containerId);

        const types = ['AppServer', 'Database', 'RM']; // LoadBalancer might be RM or something else

        console.log("DATA_START");
        for (const type of types) {
            const querySpec = {
                query: `SELECT AVG(c.latencyMs) as avg_latency, MAX(c.latencyMs) as max_latency FROM c WHERE c.serverType = '${type}'`
            };
            const { resources } = await container.items.query(querySpec).fetchAll();
            console.log(`${type}: ${JSON.stringify(resources[0])}`);
        }
        console.log("DATA_END");
    } catch (e) {
        console.error("ERROR_START");
        console.error(e);
        console.error("ERROR_END");
    }
}

checkAccuracy();
