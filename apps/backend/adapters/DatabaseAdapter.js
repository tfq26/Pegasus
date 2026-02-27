import { logger } from '../src/services/Logger.js';

const queryCache = new Map();

export class DatabaseAdapter {
  constructor(connection) {
    this.connection = connection
  }

  async connect() {
    throw new Error("connect() must be implemented")
  }


  /**
   * Executes a query and returns an async iterator for streaming results.
   * 
   * @param {string} query - The query to execute
   * @returns {AsyncIterator} An async iterator for the query results
   */
  async queryStream(query) {
    throw new Error("queryStream() must be implemented")
  }

  async disconnect() {
    throw new Error("disconnect() must be implemented")
  }

  /**
   * Universal translation hook.
   * Defaults to returning the query as-is.
   */
  async translate(query, context = {}) {
    return { translated: query, addSyntheticId: false }
  }

  /**
   * Row cleaning hook to remove provider-specific metadata.
   */
  cleanRow(row) {
    return row
  }

  /**
   * Template method for query execution with automatic resource guarding and caching.
   */
  async query(queryString, options = {}) {
    const { ttl = 0 } = options; // Default no cache
    const cacheKey = `${this.constructor.name}:${queryString}:${JSON.stringify(options.connection || {})}`;

    if (ttl > 0) {
      const cached = queryCache.get(cacheKey);
      if (cached && Date.now() < cached.expires) {
        logger.debug(`[${this.constructor.name}] Cache Hit for query`, { queryString: queryString.substring(0, 50) });
        return cached.data;
      }
    }

    const { ResourceGuard } = await import('../src/services/ResourceGuard.js')
    const maxRows = options.maxRows || 10000
    const guard = new ResourceGuard({ maxRows, maxMemoryMB: options.maxMemoryMB || 512 })

    const results = []
    let count = 0

    try {
      const stream = this.queryStream(queryString, options)
      for await (const row of stream) {
        results.push(this.cleanRow(row))
        count++
        if (count % 100 === 0) guard.check(count)
      }
      if (ttl > 0) {
        queryCache.set(cacheKey, {
          data: results,
          expires: Date.now() + ttl
        });
      }

      return results
    } catch (e) {
      logger.error(`[${this.constructor.name}] query error`, e, { queryString });
      throw e
    }
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
