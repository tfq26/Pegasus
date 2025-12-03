import { DatabaseAdapter } from "./DatabaseAdapter.js"
import mysql from "mysql2/promise"

export class MySQLAdapter extends DatabaseAdapter {
  async connect() {
    this.client = await mysql.createConnection({
      host: this.connection.host,
      port: this.connection.port ?? 3306,
      user: this.connection.user,
      password: this.connection.password,
      database: this.connection.database
    })
  }

  async query(query) {
    if (!this.client) await this.connect()

    const [result, fields] = await this.client.query(query)

    // MySQL returns an array for SELECT, but an object (ResultSetHeader) for mutations
    if (Array.isArray(result)) {
      return result
    } else {
      // It's a mutation result (OkPacket/ResultSetHeader)
      return {
        affectedRows: result.affectedRows,
        insertId: result.insertId,
        message: `${result.affectedRows} rows affected`,
        warningStatus: result.warningStatus
      }
    }
  }

  async listCollections() {
    const [rows] = await this.client.query('SHOW FULL TABLES')
    return rows
      .map((row) => {
        const value = Object.values(row)[0]
        return typeof value === 'string' ? value : undefined
      })
      .filter(Boolean)
  }

  async sampleCollection(name, limit = 5) {
    if (!name) return []
    const safeLimit = Math.max(1, Number(limit) || 5)
    const safeName = name.replace(/`/g, '``')
    const query = `SELECT * FROM \`${safeName}\` LIMIT ${safeLimit}`
    return this.query(query)
  }

  async getSchema() {
    try {
      const [tables] = await this.client.query('SHOW FULL TABLES')
      const schema = {}

      for (const row of tables) {
        const tableName = Object.values(row)[0]
        if (typeof tableName === 'string') {
          const [columns] = await this.client.query(`DESCRIBE \`${tableName}\``)
          schema[tableName] = columns.map(col => ({
            name: col.Field,
            type: col.Type,
            nullable: col.Null === 'YES',
            pk: col.Key === 'PRI'
          }))
        }
      }

      return schema
    } catch (e) {
      console.error('[MySQL] Error fetching schema:', e)
      return {}
    }
  }

  async disconnect() {
    if (this.client) await this.client.end()
  }
}
