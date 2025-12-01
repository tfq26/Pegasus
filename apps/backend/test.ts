// test-mongo.ts
// Updated: list databases in the cluster (used to emulate the backend `/schema` discovery behavior)
import { MongoClient } from "mongodb";

const uri = "mongodb+srv://taufeeq26:4dgT4GBUogR1PCPq@toroscluster.2stjj.mongodb.net/?appName=TorosCluster";

async function listDatabases() {
  const client = new MongoClient(uri);

  try {
    console.log("🔌 Connecting to MongoDB...");
    await client.connect();
    console.log("✅ Connected!");

    // Use the admin command to list databases available to this user
    const admin = client.db().admin();
    const result = await admin.listDatabases();

    const dbNames = (result.databases || []).map((d: any) => d.name);
    console.log("📚 Discovered databases:");
    console.log(JSON.stringify(dbNames, null, 2));

    // Optionally, print a little more info per-database
    console.log("� Database info:");
    console.log(JSON.stringify(result.databases || [], null, 2));

    console.log("🎉 Database discovery success!");
  } catch (err) {
    console.error("❌ MongoDB discovery error:", err);
  } finally {
    await client.close();
  }
}

listDatabases();
