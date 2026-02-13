
import { CosmosClient } from "@azure/cosmos";

const endpoint = "https://pegasustestcosmos.documents.azure.com:443/";
const key = "6e7YfiXFO3ie77ZFj1FYlY5oVMgNLlliW27LfqLJRZSun0AXVkkMxTtqhIVWuLXPm9uieoDKdeKvACDbx7Wm4Q==";
const databaseId = "PegasusLive";
const containerId = "OrionMetrics";

const client = new CosmosClient({ endpoint, key });

async function reproduce() {
    try {
        const database = client.database(databaseId);
        const container = database.container(containerId);

        // This is what the NEW logic will execute
        const originalQuery = "SELECT rowid as __id, * FROM OrionMetrics ORDER BY rowid OFFSET 0 LIMIT 10";

        // Manual translation according to NEW logic
        let translated = "SELECT * FROM c ORDER BY c.id OFFSET 0 LIMIT 10";

        console.log("Executing query:", translated);
        const { resources } = await container.items.query(translated).fetchAll();
        console.log("Success! Count:", resources.length);

        // Simulate addSyntheticId logic
        resources.forEach(r => r.__id = r.id);
        console.log("First item sample:", JSON.stringify(resources[0], null, 2));
    } catch (e) {
        console.error("FAILED");
        console.error(e.message);
        if (e.body) console.error("Body:", e.body);
    }
}

reproduce();
