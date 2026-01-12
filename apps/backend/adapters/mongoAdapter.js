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

  // Recursive helper to flatten nested objects for tabular view
  _flatten(doc, parentKey = '', result = {}) {
    if (!doc) return result;
    for (const [key, value] of Object.entries(doc)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      // Don't flatten ObjectIds or Dates (treat as primitives for display)
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && value?._bsontype !== 'ObjectId') {
        this._flatten(value, fullKey, result);
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }

  // Restore nested structure from flat dot-notation keys
  _unflatten(flatDoc) {
    const result = {};
    for (const [key, value] of Object.entries(flatDoc)) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          current[part] = value;
        } else {
          current[part] = current[part] || {};
          current = current[part];
        }
      }
    }
    return result;
  }

  async applyOperations(tableName, operations) {
    if (!this.db) throw new Error('No database selected.');
    const target = this.db.collection(tableName);
    const { ObjectId } = await import('mongodb');

    for (const op of operations) {
      switch (op.type) {
        case 'full_replacement':
          // For MongoDB, full replacement means delete all and insert all
          await target.deleteMany({});
          if (op.rows && op.rows.length > 0) {
            const unflattenedRows = op.rows.map(r => {
              const cleaned = this._unflatten(r);
              delete cleaned._id;
              return cleaned;
            });
            await target.insertMany(unflattenedRows);
          }
          break;

        case 'create':
          if (op.data) {
            const newDoc = this._unflatten(op.data);
            delete newDoc._id;
            await target.insertOne(newDoc);
          }
          break;

        case 'update':
          if (op.id && op.changes) {
            const mongoId = typeof op.id === 'string' && op.id.length === 24 ? new ObjectId(op.id) : op.id;
            // Use dot notation for updates to match flattened grid view
            const updateData = {};
            for (const [key, value] of Object.entries(op.changes)) {
              if (key === '_id') continue;
              updateData[key] = value;
            }
            if (Object.keys(updateData).length > 0) {
              await target.updateOne({ _id: mongoId }, { $set: updateData });
            }
          }
          break;

        case 'delete':
          if (op.id) {
            const mongoId = typeof op.id === 'string' && op.id.length === 24 ? new ObjectId(op.id) : op.id;
            await target.deleteOne({ _id: mongoId });
          }
          break;

        case 'drop_column':
          if (op.column) {
            await target.updateMany({}, { $unset: { [op.column]: "" } });
          }
          break;

        case 'add_column':
          // MongoDB is schemaless, no-op for adding a column
          break;
      }
    }
  }

  async saveData(tableName, updates, deletedRowIds, deletedColumns) {
    if (!this.db) throw new Error('No database selected.');
    const target = this.db.collection(tableName);
    const { ObjectId } = await import('mongodb');

    // Convert updates/deletes to operations format and use applyOperations for consistency
    const ops = [];
    if (deletedRowIds) {
      deletedRowIds.forEach(id => ops.push({ type: 'delete', id }));
    }
    if (deletedColumns) {
      deletedColumns.forEach(column => ops.push({ type: 'drop_column', column }));
    }
    if (updates) {
      updates.forEach(update => {
        const id = update.data?._id || update.original?._id;
        if (id) {
          ops.push({ type: 'update', id, changes: update.data });
        } else {
          ops.push({ type: 'create', data: update.data });
        }
      });
    }

    await this.applyOperations(tableName, ops);
    return { success: true };
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
          } catch (innerError) {
            throw new Error(`MongoDB query must be a valid JSON payload. Could not extract valid JSON.`)
          }
        } else {
          throw new Error(`MongoDB query must be a valid JSON payload.`)
        }
      }
    }

    const {
      filter = {},
      skip = 0,
      limit = 1000,
      collection: overrideCollection,
      pipeline,
      flatten = true // Enable flattening by default for spreadsheet view
    } = payload ?? {}

    // Determine target collection
    let targetCollection
    if (overrideCollection) {
      if (!this.db) throw new Error('No database selected.')
      targetCollection = this.db.collection(overrideCollection)
    } else if (this.collection) {
      targetCollection = this.collection
    } else {
      throw new Error('No collection specified.')
    }

    // Handle aggregation pipeline
    let results
    if (pipeline && Array.isArray(pipeline)) {
      results = await targetCollection.aggregate(pipeline).toArray()
    } else {
      // Handle regular find query
      results = await targetCollection
        .find(filter)
        .skip(Math.max(0, Number(skip)))
        .limit(Math.max(1, Number(limit)))
        .toArray()
    }

    return flatten ? results.map(doc => this._flatten(doc)) : results;
  }

  async disconnect() {
    if (this.client) await this.client.close()
  }

  async listCollections() {
    if (this.db) {
      const collections = await this.db.listCollections().toArray()
      return collections.map((collection) => collection.name)
    }

    const admin = this.client.db().admin()
    let dbs
    try {
      dbs = await admin.listDatabases()
    } catch (err) {
      const e = new Error('Insufficient privileges to list databases')
      e.code = 'LIST_DATABASES_DENIED'
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
      } catch (err) { }
    }
    return all
  }

  async sampleCollection(name, limit = 5) {
    if (!name) return []
    const safeLimit = Math.max(1, Number(limit) || 5)

    let target
    if (name.includes('.')) {
      const [dbName, collName] = name.split('.', 2)
      target = this.client.db(dbName).collection(collName)
    } else {
      target = this.db.collection(name)
    }

    const samples = await target.find({}).limit(safeLimit).toArray()
    return samples.map(doc => this._flatten(doc));
  }

  async getSchema() {
    try {
      const collections = await this.listCollections()
      const schema = {}
      const collectionsToScan = collections.slice(0, 20)

      for (const collName of collectionsToScan) {
        const samples = await this.sampleCollection(collName, 10) // More samples for better inference
        if (samples.length > 0) {
          const fields = {}
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
