import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { MongoClient } from "mongodb"

export class MongoAdapter extends DatabaseAdapter {
  async connect() {
    this.client = new MongoClient(this.connection.url)
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
  }

  async query(query) {
    let payload = query

    if (typeof query === 'string') {
      try {
        payload = JSON.parse(query)
      } catch (error) {
        throw new Error('MongoDB query must be a JSON payload')
      }
    }

    const {
      filter = {},
      skip = 0,
      limit = 1000,
      collection: overrideCollection,
    } = payload ?? {}

    const targetCollection = overrideCollection
      ? this.db.collection(overrideCollection)
      : this.collection

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
}
