import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { Client as KustoClient, KustoConnectionStringBuilder } from "azure-kusto-data"
import fs from 'fs'
import path from 'path'


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
      // If no explicit credentials, try Azure CLI authentication (requires 'az login')
      if (typeof KustoConnectionStringBuilder.withAzCliAuthentication === 'function') {
        kcsb = KustoConnectionStringBuilder.withAzCliAuthentication(cluster)
      } else {
        throw new Error("Kusto connection requires Tenant ID, Client ID, and Client Secret. (Azure CLI authentication is not supported in this environment)")
      }
    }

    this.client = new KustoClient(kcsb)
  }

  async query(query) {
    try {
      const result = await this.client.execute(this.connection.database, query)

      // Handle case where result is directly an array
      if (Array.isArray(result)) return result

      const tableResult = result.primaryResults?.[0]
      if (!tableResult) {
        return []
      }

      // 1. Try to access raw rows directly (most reliable for this library version)
      if (Array.isArray(tableResult._rows)) {
        return this._mapRows(tableResult._rows, tableResult.columns)
      }

      // 2. Try toArray()
      try {
        if (typeof tableResult.toArray === 'function') {
          return tableResult.toArray()
        }
      } catch (e) {
        console.warn('[Kusto] toArray() failed:', e)
      }

      // 3. Try rows() generator or property
      let rows = []
      try {
        if (typeof tableResult.rows === 'function') {
          // It's a generator method, must be called with context
          rows = Array.from(tableResult.rows())
        } else if (Array.isArray(tableResult.rows)) {
          rows = tableResult.rows
        }
      } catch (e) {
        console.warn('[Kusto] Failed to access .rows():', e)
      }

      if (!Array.isArray(rows)) return []

      return this._mapRows(rows, tableResult.columns)

    } catch (error) {
      console.error('[Kusto] Query execution error:', error)
      throw error
    }
  }

  _mapRows(rows, columns) {
    if (!rows || rows.length === 0) return []

    // If rows are already objects, return them
    if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
      return rows
    }

    // Map array rows to objects using columns
    if (columns && Array.isArray(columns) && columns.length > 0) {
      return rows.map(row => {
        const obj = {}
        columns.forEach((col, i) => {
          const colName = col.name || col.Name || `col${i}`
          // Handle case where row might be object or array
          obj[colName] = (row && typeof row === 'object' && !Array.isArray(row)) ? row[colName] : row[i]
        })
        return obj
      })
    }

    return rows
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
      const isConnectionError = error.code === 'ECONNREFUSED' ||
        (error.message && error.message.includes('ECONNREFUSED')) ||
        (error.message && error.message.includes('Failed to get cloud info'));

      if (!isConnectionError) {
        console.error("Kusto Error:", error)
      }

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

  async getSchema() {
    try {
      const result = await this.client.execute(this.connection.database, '.show database schema')
      const tableResult = result.primaryResults?.[0]
      if (!tableResult) return {}

      let rows = []
      if (typeof tableResult.toArray === 'function') {
        rows = tableResult.toArray()
      } else if (Array.isArray(tableResult.rows)) {
        rows = tableResult.rows
      }

      const schema = {}

      // Kusto schema result typically has: TableName, ColumnName, ColumnType
      for (const row of rows) {
        const tableName = row.TableName || row.Name
        const colName = row.ColumnName
        const colType = row.ColumnType || row.CslType

        if (tableName && colName) {
          if (!schema[tableName]) {
            schema[tableName] = []
          }
          schema[tableName].push({
            name: colName,
            type: colType,
            nullable: true, // Kusto columns are generally nullable
            pk: false
          })
        }
      }

      return schema
    } catch (e) {
      console.error('[Kusto] Error fetching schema:', e)
      return {}
    }
  }

  async disconnect() {
    // No persistent connection needed for Kusto
    this.client = null
  }
}
