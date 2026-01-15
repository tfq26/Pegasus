
/**
 * Abstract Base Class for Cloud Storage Providers
 */
export class CloudStorageProvider {
    constructor() {
        if (this.constructor === CloudStorageProvider) {
            throw new Error("Abstract classes can't be instantiated.");
        }
    }

    /**
     * Upload a file
     * @param {string} filename 
     * @param {string|Buffer|object} data 
     * @param {object} config - Provider specific config (bucket, credentials)
     * @returns {Promise<string>} - The URL or Identifier of the uploaded file
     */
    async upload(filename, data, config) {
        throw new Error("Method 'upload()' must be implemented.");
    }

    /**
     * Download a file
     * @param {string} filename 
     * @param {object} config 
     */
    async download(filename, config) {
        throw new Error("Method 'download()' must be implemented.");
    }

    /**
     * List files
     * @param {object} config 
     */
    async list(config) {
        throw new Error("Method 'list()' must be implemented.");
    }
}
