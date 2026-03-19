import { CosmosClient } from "@azure/cosmos";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i++;
  }
  return args;
}

async function runQuery(container, label, query) {
  console.log(`\n=== ${label} ===`);
  console.log(query.trim());
  const { resources } = await container.items.query({ query }).fetchAll();
  console.log(`Rows: ${resources.length}`);
  console.log(JSON.stringify(resources, null, 2));
  return resources;
}

async function main() {
  const args = parseArgs(process.argv);
  const date = args.date || "2026-03-09";
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE || "PegasusLive";
  const containerId = process.env.COSMOS_CONTAINER || "OrionMetrics";

  if (!endpoint || !key) {
    console.error("Missing Cosmos credentials in environment.");
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const container = client.database(databaseId).container(containerId);

  console.log(`Inspecting ${databaseId}.${containerId} for date=${date}`);

  const q1 = `
    SELECT c.serverType, COUNT(1) AS cnt
    FROM c
    WHERE CONTAINS(c.timestamp, '${date}')
    GROUP BY c.serverType
  `;

  const q2 = `
    SELECT VALUE COUNT(1)
    FROM c
    WHERE CONTAINS(c.timestamp, '${date}')
      AND c.serverType = 'AppServer'
  `;

  const q3 = `
    SELECT VALUE COUNT(1)
    FROM (
      SELECT DISTINCT c.serverName
      FROM c
      WHERE CONTAINS(c.timestamp, '${date}')
        AND c.serverType = 'AppServer'
    ) s
  `;

  const q4 = `
    SELECT DISTINCT c.serverName, c.serverType
    FROM c
    WHERE CONTAINS(c.timestamp, '${date}')
      AND (
        CONTAINS(LOWER(c.serverName), 'appserver')
        OR CONTAINS(LOWER(c.serverName), 'app server')
      )
  `;

  try {
    await runQuery(container, "By serverType counts (day)", q1);
    await runQuery(container, "Raw AppServer row count (day)", q2);
    await runQuery(container, "Distinct AppServer host count (day)", q3);
    await runQuery(container, "Hosts with app-server-like names (day)", q4);
  } catch (e) {
    console.error("Query failed:", e.message);
    if (e.code) console.error("Code:", e.code);
    if (e.activityId) console.error("ActivityId:", e.activityId);
    process.exit(1);
  }
}

main();
