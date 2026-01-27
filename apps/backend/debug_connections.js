import { db } from "./src/db/index.js";
import { connections } from "./src/db/schema.js";
import { eq } from "drizzle-orm";

async function checkConnections() {
    const list = await db.select().from(connections);
    console.log(JSON.stringify(list, null, 2));
    process.exit(0);
}

checkConnections();
