// backend/lib/cosmos.ts
// Azure Cosmos DB integration for Pegasus backend

import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT || "";
const key = process.env.COSMOS_KEY || "";
const databaseId = "Pegasus";
const containerId = "UserData";

export const client = new CosmosClient({ endpoint, key });
export const database = client.database(databaseId);
export const container = database.container(containerId);

export async function saveConversation(conversation) {
  return container.items.create(conversation);
}

export async function saveQuery(queryHistory) {
  return container.items.create(queryHistory);
}

export async function saveSetting(setting) {
  return container.items.create(setting);
}
