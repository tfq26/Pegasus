
import { db } from "../db/index.ts"
import { KustoAdapter } from "./adapters/kustoAdapter.js"

async function testKusto() {
    console.log("🔍 Looking for Kusto connections in database...")

    try {
        const rs = await db.execute("SELECT * FROM connections WHERE provider = 'kusto'")
        const connections = rs.rows

        if (connections.length === 0) {
            console.error("❌ No Kusto connections found in the database.")
            console.log("Please add a Kusto connection via the UI first.")
            process.exit(1)
        }

        console.log(`✅ Found ${connections.length} Kusto connection(s).`)

        // Use the first connection
        const connRow = connections[0]
        const config = JSON.parse(connRow.config)
        const kustoConfig = config.kusto

        console.log(`\nTesting connection: ${connRow.nickname}`)
        console.log(`Cluster: ${kustoConfig.cluster}`)
        console.log(`Database: ${kustoConfig.database}`)

        const adapter = new KustoAdapter(kustoConfig)

        console.log("\n🔌 Connecting...")
        await adapter.connect()
        console.log("✅ Connected!")

        console.log("\n📂 Listing tables...")
        const tables = await adapter.listCollections()
        console.log(`Found ${tables.length} tables:`, tables.slice(0, 5), tables.length > 5 ? "..." : "")

        if (tables.length > 0) {
            const table = tables[0]
            console.log(`\n📊 Sampling table '${table}'...`)
            const results = await adapter.sampleCollection(table, 5)
            console.log("Results:", JSON.stringify(results, null, 2))
        } else {
            console.log("⚠️ No tables found to sample.")
        }

        await adapter.disconnect()
        console.log("\n✅ Test complete.")

    } catch (error) {
        console.error("\n❌ Error:", error)
        process.exit(1)
    }
}

testKusto()
