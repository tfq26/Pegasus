
import { AzureBlobProvider } from './providers/AzureBlobProvider.js';
import { S3Provider } from './providers/S3Provider.js';
import { GCSProvider } from './providers/GCSProvider.js';

export class StorageFactory {
    static getProvider(serviceType) {
        switch (serviceType) {
            case 'azure_blob':
                return new AzureBlobProvider();
            case 's3':
                return new S3Provider();
            case 'gcs':
                // Note: 'gcs' is used in frontend config for Google Cloud Storage
                return new GCSProvider();
            default:
                // Fallback or throw
                console.warn(`[StorageFactory] Unknown service type '${serviceType}', defaulting to AzureBlob configured context or error.`);
                return new AzureBlobProvider();
        }
    }
}
