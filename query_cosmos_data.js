
import { CosmosClient } from "@azure/cosmos";

const endpoint = "https://pegasustestcosmos.documents.azure.com:443/";
const key = "6e7YfiXFO3ie77ZFj1FYlY5oVMgNLlliW27LfqLJRZSun0AXVkkMxTtqhIVWuLXPm9uieoDKdeKvACDbx7Wm4Q==";
const databaseId = "PegasusLive";
const containerId = "OrionMetrics";

console.log(`Connecting to ${endpoint} -> ${databaseId} -> ${containerId}...`);

try {
    const client = new CosmosClient({
        endpoint,
        key
    });

    const database = client.database(databaseId);
    const container = database.container(containerId);

    console.log("Executing query: SELECT TOP 5 * FROM c");

    const { resources: items } = await container.items
        .query("SELECT TOP 5 * FROM c")
        .fetchAll();

    console.log(`Successfully retrieved ${items.length} records:`);
    console.log(JSON.stringify(items, null, 2));

} catch (error) {
    console.error("Query failed!");
    console.error(error);
}
