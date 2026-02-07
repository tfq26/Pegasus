// backend/lib/cosmos.ts
// Azure Cosmos DB integration for Pegasus backend

import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT || "";
const key = process.env.COSMOS_KEY || "";
const databaseId = "Pegasus";
const containerId = "UserData";
const liveDbId = "PegasusLive";
const metricsContainerId = "OrionMetrics";

export let client: CosmosClient | null = null;
export let database: any = null;
export let container: any = null;
export let liveDatabase: any = null;
export let metricsContainer: any = null;

if (endpoint && key) {
  try {
    client = new CosmosClient({ endpoint, key });
    database = client.database(databaseId);
    container = database.container(containerId);
    liveDatabase = client.database(liveDbId);
    metricsContainer = liveDatabase.container(metricsContainerId);
  } catch (e) {
    console.error("[Cosmos DB] Error initializing client:", e);
  }
} else {
  console.warn("[Cosmos DB] Environment variables COSMOS_ENDPOINT or COSMOS_KEY are missing. Cosmos integration will be disabled.");
}

export async function saveConversation(conversation: any) {
  return (container as any).items.create(conversation);
}

export async function saveQuery(queryHistory: any) {
  return (container as any).items.create(queryHistory);
}

export async function saveSetting(setting: any) {
  return (container as any).items.create(setting);
}
