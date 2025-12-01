import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { Client as KustoClient, KustoConnectionStringBuilder } from "azure-kusto-data"

export class KustoAdapter extends DatabaseAdapter {
  async connect() {
    const { cluster, tenantId, clientId, clientSecret } = this.connection

    if (cluster.includes("AccountEndpoint=")) {
      throw new Error("This looks like a Cosmos DB connection string. Please use a valid Kusto cluster URL (e.g., https://cluster.region.kusto.windows.net).")
    }

    let kcsb
    if (clientId && clientSecret && tenantId) {
      kcsb = KustoConnectionStringBuilder.withAadApplicationKeyAuthentication(
        cluster,
        clientId,
        clientSecret,
        tenantId
      )
    } else {
      throw new Error("Kusto connection requires Tenant ID, Client ID, and Client Secret.")
    }

    this.client = new KustoClient(kcsb)
  }

  async query(query) {
    const result = await this.client.execute(this.connection.database, query)
    const tableResult = result.primaryResults?.[0]
    if (!tableResult) {
      return []
    }

    // Handle both row-oriented and column-oriented results if necessary, 
    // but typically toArray() gives objects
    return typeof tableResult.toArray === 'function' ? tableResult.toArray() : tableResult.rows ?? []
  }

  async listCollections() {
    // .show tables returns a table with 'TableName', 'DatabaseName', etc.
    try {
      const result = await this.client.execute(this.connection.database, '.show tables')
      const tableResult = result.primaryResults?.[0]
      if (!tableResult) {
        return []
      }

      let rows = []
      if (typeof tableResult.toArray === 'function') {
        rows = tableResult.toArray()
      } else if (typeof tableResult.rows === 'function') {
        rows = Array.from(tableResult.rows())
      } else if (Array.isArray(tableResult.rows)) {
        rows = tableResult.rows
      }

      if (!Array.isArray(rows)) {
        console.warn("Kusto rows is not an array:", rows)
        rows = []
      }

      return rows
        .map((row) => {
          // row is typically an object { TableName: '...', ... }
          const candidate = row.TableName ?? row.Name ?? row['Table']
          return typeof candidate === 'string' ? candidate : undefined
        })
        .filter(Boolean)
    } catch (error) {
      console.error("Kusto Error:", error)

      const isEntityNotFound = error.code === 'BadRequest_EntityNotFound' ||
        (error.message && error.message.includes("EntityNotFound")) ||
        (error["@type"] && error["@type"].includes("EntityNotFoundException"))

      if (isEntityNotFound) {
        throw new Error(`Database '${this.connection.database}' was not found in the cluster. Please verify the database name in Azure Portal.`)
      }

      if (error.message && (error.message.includes("Request is invalid") || error.message.includes("404"))) {
        throw new Error(`Failed to connect to Kusto. Please check if database '${this.connection.database}' exists and the App has 'Viewer' permissions.`)
      }
      throw error
    }
  }

  async sampleCollection(name, limit = 5) {
    if (!name) return []
    const safeLimit = Math.max(1, Number(limit) || 5)
    // Basic sanitization to prevent injection if name comes from untrusted source
    // Kusto table names can be wrapped in ['...'] if they contain spaces/special chars
    const sanitized = name.includes(' ') || name.includes('.') ? `['${name}']` : name
    const sampleQuery = `${sanitized} | take ${safeLimit}`
    return this.query(sampleQuery)
  }

  async disconnect() {
    // No persistent connection needed for Kusto
    this.client = null
  }
}
