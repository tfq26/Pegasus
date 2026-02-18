export class DatabaseAdapter {
  constructor(connection) {
    this.connection = connection
  }

  async connect() {
    throw new Error("connect() must be implemented")
  }

  async query(query) {
    throw new Error("query() must be implemented")
  }

  async disconnect() {
    throw new Error("disconnect() must be implemented")
  }

  async listCollections() {
    return []
  }

  async sampleCollection(/* collectionName, limit = 5 */) {
    return []
  }

  async getEstimatedCount(collectionName) {
    return null
  }
}
