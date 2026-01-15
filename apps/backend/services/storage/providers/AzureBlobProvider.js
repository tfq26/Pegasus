
import { BlobServiceClient } from '@azure/storage-blob';
import { CloudStorageProvider } from '../CloudStorageProvider.js';

export class AzureBlobProvider extends CloudStorageProvider {
    async upload(filename, data, config) {
        let client;

        // 1. Initialize Client
        if (config.connectionString) {
            client = BlobServiceClient.fromConnectionString(config.connectionString);
        } else if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
            client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        } else {
            throw new Error('[AzureBlobProvider] No Connection String provided.');
        }

        // 2. Determine Container
        const containerName = config.bucket || process.env.AZURE_CONTAINER_NAME || 'pegasus-snapshots';

        // 3. Upload
        const containerClient = client.getContainerClient(containerName);
        await containerClient.createIfNotExists();

        const blockBlobClient = containerClient.getBlockBlobClient(filename);

        const content = typeof data === 'string' ? data : JSON.stringify(data);
        await blockBlobClient.upload(content, content.length);

        return blockBlobClient.url;
    }
}
