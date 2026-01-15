
import { BlobServiceClient } from '@azure/storage-blob';

/**
 * Azure Blob Storage Service
 * Handles uploading snapshot files to Azure
 */
export class AzureStorageService {
    constructor() {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

        if (!connectionString) {
            console.warn('[Azure] AZURE_STORAGE_CONNECTION_STRING not found. Azure uploads will fail.');
            this.blobServiceClient = null;
        } else {
            try {
                this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
                console.log('[Azure] Initialized BlobServiceClient');
            } catch (e) {
                console.error('[Azure] Failed to initialize client:', e.message);
                this.blobServiceClient = null;
            }
        }

        this.containerName = process.env.AZURE_CONTAINER_NAME || 'pegasus-snapshots';
    }

    async uploadSnapshot(filename, data, config = {}) {
        let client = this.blobServiceClient;
        let container = this.containerName;

        // Dynamic Configuration Override (BYOC)
        if (config.connectionString) {
            try {
                client = BlobServiceClient.fromConnectionString(config.connectionString);
            } catch (e) {
                console.error('[Azure] Invalid BYOC Connection String:', e.message);
                throw e;
            }
        }

        if (config.containerName) {
            container = config.containerName;
        }

        if (!client) {
            throw new Error('Azure Storage is not configured (System or BYOC).');
        }

        try {
            // Get container client
            const containerClient = client.getContainerClient(container);

            // Ensure container exists
            await containerClient.createIfNotExists();

            // Get block blob client
            const blockBlobClient = containerClient.getBlockBlobClient(filename);

            // Upload
            console.log(`[Azure] Uploading ${filename} to container ${container}...`);
            const content = typeof data === 'string' ? data : JSON.stringify(data);

            const uploadBlobResponse = await blockBlobClient.upload(content, content.length);
            console.log(`[Azure] Upload successful. RequestId: ${uploadBlobResponse.requestId}`);

            return blockBlobClient.url;
        } catch (error) {
            console.error('[Azure] Upload failed:', error.message);
            throw error;
        }
    }
}

// Singleton instance
export const azureService = new AzureStorageService();
