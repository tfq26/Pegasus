
import { Storage } from '@google-cloud/storage';
import { CloudStorageProvider } from '../CloudStorageProvider.js';

export class GCSProvider extends CloudStorageProvider {
    async upload(filename, data, config) {
        // 1. Initialize Client
        let storage;

        if (config.credentialsJSON) {
            // If full JSON key is passed
            const credentials = JSON.parse(config.credentialsJSON);
            storage = new Storage({ credentials });
        } else if (config.keyFilename) {
            storage = new Storage({ keyFilename: config.keyFilename });
        } else {
            // Fallback to ADC (Application Default Credentials)
            storage = new Storage();
        }

        // 2. Determine Bucket
        const bucketName = config.bucket;
        if (!bucketName) throw new Error('[GCSProvider] Bucket name is required.');

        // 3. Upload
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(filename);

        const content = typeof data === 'string' ? data : JSON.stringify(data);
        await file.save(content, {
            contentType: 'application/json'
        });

        return `gs://${bucketName}/${filename}`;
    }
}
