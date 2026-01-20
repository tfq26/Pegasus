
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { CloudStorageProvider } from '../CloudStorageProvider.js';

export class S3Provider extends CloudStorageProvider {
    constructor(config) {
        super();
        this.config = config || {};

        const clientConfig = {
            region: this.config.region || 'us-east-1',
            credentials: {
                accessKeyId: this.config.accessKeyId || this.config.accessKey,
                secretAccessKey: this.config.secretAccessKey || this.config.secretKey
            }
        };

        // Support custom endpoint (e.g., Backblaze B2, DigitalOcean Spaces)
        if (this.config.endpoint) {
            clientConfig.endpoint = this.config.endpoint;
        }

        this.client = new S3Client(clientConfig);
        this.bucket = this.config.bucket;
    }

    async upload(key, data, mimeType = 'application/octet-stream') {
        if (!this.bucket) throw new Error('[S3Provider] Bucket is not configured.');

        // Use @aws-sdk/lib-storage for efficient upload of streams/buffers
        const upload = new Upload({
            client: this.client,
            params: {
                Bucket: this.bucket,
                Key: key,
                Body: data,
                ContentType: mimeType
            }
        });

        await upload.done();
        return {
            key,
            bucket: this.bucket,
            provider: 's3',
            url: `s3://${this.bucket}/${key}` // Internal reference
        };
    }

    async getPresignedUrl(key, expiresIn = 3600) {
        if (!this.bucket) throw new Error('[S3Provider] Bucket is not configured.');

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key
        });

        return getSignedUrl(this.client, command, { expiresIn });
    }

    async delete(key) {
        if (!this.bucket) throw new Error('[S3Provider] Bucket is not configured.');

        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key
        });

        await this.client.send(command);
    }
}
