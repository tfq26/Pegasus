import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { Client as KustoClient } from "azure-kusto-data"

export class KustoAdapter extends DatabaseAdapter {
  async connect() {
    this.client = new KustoClient(this.connection.cluster)
  }

  async query(query) {
    const result = await this.client.execute(this.connection.database, query)
    const tableResult = result.primaryResults?.[0]
    if (!tableResult) {
      return []
    }

    return typeof tableResult.toArray === 'function' ? tableResult.toArray() : tableResult.rows ?? []
  }

  async listCollections() {
    const result = await this.client.execute(this.connection.database, '.show tables')
    const tableResult = result.primaryResults?.[0]
    if (!tableResult) {
      return []
    }

    const rows = typeof tableResult.toArray === 'function' ? tableResult.toArray() : tableResult.rows ?? []

    return rows
      .map((row) => {
        const candidate = row.TableName ?? row.Name ?? row['Table']
        return typeof candidate === 'string' ? candidate : undefined
      })
      .filter(Boolean)
  }

  async sampleCollection(name, limit = 5) {
    if (!name) return []
    const safeLimit = Math.max(1, Number(limit) || 5)
    const sanitized = name.replace(/"/g, '\\"')
    const sampleQuery = `${sanitized} | take ${safeLimit}`
    return this.query(sampleQuery)
  }

  async disconnect() {
    // No persistent connection needed for Kusto
  }
}
