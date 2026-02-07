
import { CosmosClient } from "@azure/cosmos";

const endpoint = "https://pegasustestcosmos.documents.azure.com:443/";
const key = "6e7YfiXFO3ie77ZFj1FYlY5oVMgNLlliW27LfqLJRZSun0AXVkkMxTtqhIVWuLXPm9uieoDKdeKvACDbx7Wm4Q==";
const databaseId = "PegasusLive";

console.log("Attempting to connect with:");
console.log("Endpoint:", endpoint);
console.log("Database:", databaseId);

try {
    const client = new CosmosClient({
        endpoint,
        key
    });

    const database = client.database(databaseId);
    console.log("Reading database...");
    const { resource: dbResource } = await database.read();
    console.log("Database read success:", dbResource.id);

    console.log("Listing containers...");
    const { resources: containers } = await database.containers.readAll().fetchAll();
    console.log("Containers found:", containers.map(c => c.id));

} catch (error) {
    console.error("Connection failed!");
    console.error(error);
}
