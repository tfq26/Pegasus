import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { MongoClient } from "mongodb"

export class MongoAdapter extends DatabaseAdapter {
  async connect() {
    try {
      // Force IPv4 (family: 4) to avoid potential dual-stack issues across environments
      this.client = new MongoClient(this.connection.url, {
        family: 4,
        serverSelectionTimeoutMS: 5000
      })
      await this.client.connect()

      // Only set a specific DB if one was provided; otherwise leave null so we can enumerate DBs
      if (this.connection && this.connection.database && typeof this.connection.database === 'string' && this.connection.database.trim()) {
        this.db = this.client.db(this.connection.database)
      } else {
        this.db = null
      }
      // Only set a default collection if one was provided
      if (this.connection && this.connection.collection && typeof this.connection.collection === 'string' && this.connection.collection.trim()) {
        this.collection = this.db.collection(this.connection.collection)
      } else {
        this.collection = null
      }
    } catch (e) {
      console.error('[Mongo] Connection failed:', e)
      // Enhance error message for common SSL/IP whitelist issues
      if (e.message && (e.message.includes('SSL') || e.message.includes('MongooseServerSelectionError') || e.message.includes('internal error'))) {
        throw new Error(`MongoDB Connection Failed: ${e.message}. \nHint: This often happens if your IP is not whitelisted. For Vercel deployments, ensure "0.0.0.0/0" (Allow from Anywhere) is added to your MongoDB Network Access.`)
      }
      throw e
    }
  }

  async query(query) {
    let payload = query

    if (typeof query === 'string') {
      try {
        payload = JSON.parse(query)
      } catch (error) {
        // Try to extract JSON from a string that might have explanatory text before/after it
        const jsonStart = query.indexOf('{')
        const jsonEnd = query.lastIndexOf('}')

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          const potentialJson = query.substring(jsonStart, jsonEnd + 1)
          try {
            payload = JSON.parse(potentialJson)
            console.log('[Mongo] Extracted JSON from query with explanatory text')
          } catch (innerError) {
            console.error("Failed to parse MongoDB query:", query)
            throw new Error(`MongoDB query must be a valid JSON payload. Could not extract valid JSON. Received: ${query.substring(0, 100)}...`)
          }
        } else {
          console.error("Failed to parse MongoDB query:", query)
          throw new Error(`MongoDB query must be a valid JSON payload. No JSON object found. Received: ${query.substring(0, 100)}...`)
        }
      }
    }

    const {
      filter = {},
      skip = 0,
      limit = 1000,
      collection: overrideCollection,
      pipeline,
    } = payload ?? {}

    // Determine target collection
    let targetCollection
    if (overrideCollection) {
      if (!this.db) {
        throw new Error('No database selected. Please specify a database in your connection settings.')
      }
      targetCollection = this.db.collection(overrideCollection)
    } else if (this.collection) {
      targetCollection = this.collection
    } else {
      throw new Error('No collection specified. MongoDB queries must include a "collection" field.')
    }

    // Handle aggregation pipeline
    if (pipeline && Array.isArray(pipeline)) {
      return targetCollection.aggregate(pipeline).toArray()
    }

    // Handle regular find query
    return targetCollection
      .find(filter)
      .skip(Math.max(0, Number(skip)))
      .limit(Math.max(1, Number(limit)))
      .toArray()
  }

  async disconnect() {
    if (this.client) await this.client.close()
  }

  async listCollections() {
    // If a database was explicitly set, list collections from that DB
    if (this.db) {
      const collections = await this.db.listCollections().toArray()
      return collections.map((collection) => collection.name)
    }

    // No specific DB provided: enumerate databases and return collections as `db.collection`
    const admin = this.client.db().admin()
    let dbs
    try {
      dbs = await admin.listDatabases()
    } catch (err) {
      // If the driver returns an authorization/permission error when listing databases,
      // surface a structured error so the gateway can return a helpful code to the UI.
      const msg = (err && err.message) ? String(err.message) : 'Failed to list databases'
      const e = new Error('Insufficient privileges to list databases: ' + msg)
      // common MongoDB server-side authorization error code is 13, but drivers expose different shapes.
      e.code = (err && (err.code || err.name)) || 'LIST_DATABASES_DENIED'
      // Normalize to a known code string for the UI
      if (e.code === 13 || String(e.code).toLowerCase().includes('authorization') || String(e.code).toLowerCase().includes('auth')) {
        e.code = 'LIST_DATABASES_DENIED'
      }
      throw e
    }
    const all = []
    for (const dbInfo of dbs.databases || []) {
      try {
        const db = this.client.db(dbInfo.name)
        const cols = await db.listCollections().toArray()
        for (const c of cols) {
          all.push(`${dbInfo.name}.${c.name}`)
        }
      } catch (err) {
        // ignore DBs we can't access
      }
    }
    return all
  }

  async sampleCollection(name, limit = 5) {
    if (!name) return []
    const safeLimit = Math.max(1, Number(limit) || 5)

    // Support names like 'db.collection' when listing across DBs without a set database
    if (name.includes('.')) {
      const [dbName, collName] = name.split('.', 2)
      const target = this.client.db(dbName).collection(collName)
      return target.find({}).limit(safeLimit).toArray()
    }

    const target = this.db.collection(name)
    return target.find({}).limit(safeLimit).toArray()
  }

  async getSchema() {
    try {
      const collections = await this.listCollections()
      const schema = {}

      // Limit to first 20 collections to avoid timeout
      const collectionsToScan = collections.slice(0, 20)

      for (const collName of collectionsToScan) {
        const samples = await this.sampleCollection(collName, 5)
        if (samples.length > 0) {
          const fields = {}

          // Infer schema from samples
          samples.forEach(doc => {
            Object.entries(doc).forEach(([key, value]) => {
              if (!fields[key]) {
                let type = typeof value
                if (value === null) type = 'null'
                else if (Array.isArray(value)) type = 'array'
                else if (value instanceof Date) type = 'date'
                else if (value && typeof value === 'object' && value._bsontype === 'ObjectId') type = 'objectId'

                fields[key] = { name: key, type: type, nullable: true, pk: key === '_id' }
              }
            })
          })

          schema[collName] = Object.values(fields)
        } else {
          schema[collName] = []
        }
      }

      return schema
    } catch (e) {
      console.error('[Mongo] Error fetching schema:', e)
      return {}
    }
  }
}
