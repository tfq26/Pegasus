
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudStorageProvider } from '../CloudStorageProvider.js';

export class S3Provider extends CloudStorageProvider {
    async upload(filename, data, config) {
        // 1. Initialize Client
        const clientConfig = {
            region: config.region || 'us-east-1',
        };

        if (config.accessKey && config.secretKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKey,
                secretAccessKey: config.secretKey
            };
        }

        const client = new S3Client(clientConfig);

        // 2. Determine Bucket
        const bucket = config.bucket;
        if (!bucket) throw new Error('[S3Provider] Bucket name is required.');

        // 3. Upload
        const content = typeof data === 'string' ? data : JSON.stringify(data);
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: filename,
            Body: content,
            ContentType: 'application/json'
        });

        await client.send(command);

        // Return pseudo-URL (S3 URLs vary by region/config)
        return `s3://${bucket}/${filename}`;
    }
}
