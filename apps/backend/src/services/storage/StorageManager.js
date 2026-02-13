
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../../db/index.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { storageCredentials, users } from "../../db/schema.js";
import { secretService } from "../SecretService.js";
import { eq, and } from "drizzle-orm";

class S3Provider {
    constructor(config) {
        this.config = config;
        this.client = new S3Client({
            region: config.region || "us-east-1",
            endpoint: config.endpoint, // Optional, for B2/MinIO
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            },
            forcePathStyle: true // Needed for some S3 compatible providers
        });
        this.bucket = config.bucket;
        this.providerType = 's3'; // or 'b2' etc.
    }

    async write(key, buffer, mimeType) {
        return this.upload(key, buffer, mimeType);
    }

    async read(key) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        const response = await this.client.send(command);
        return Buffer.from(await response.Body.transformToByteArray());
    }

    async upload(key, buffer, mimeType) {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
        });

        try {
            await this.client.send(command);
            return {
                key: key,
                bucket: this.bucket,
                url: await this.getPresignedUrl(key)
            };
        } catch (error) {
            // Auto-create bucket if it doesn't exist
            if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket') {
                console.log(`[S3Provider] Bucket ${this.bucket} not found. Attempting to create...`);
                try {
                    await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
                    console.log(`[S3Provider] Bucket ${this.bucket} created successfully.`);

                    // Retry upload
                    await this.client.send(command);
                    return {
                        key: key,
                        bucket: this.bucket,
                        url: await this.getPresignedUrl(key)
                    };
                } catch (createErr) {
                    console.error("Failed to create bucket during upload:", createErr);
                    throw new Error(`Upload failed: Bucket ${this.bucket} not found and creation failed: ${createErr.message}`);
                }
            }

            console.error("S3 Upload Error:", error);
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

    async getPresignedUrl(key, expiresIn = 3600) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        return getSignedUrl(this.client, command, { expiresIn });
    }

    async delete(key) {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        await this.client.send(command);
    }
}

class GCPProvider {
    constructor(config) {
        this.accessToken = config.accessToken;
        this.bucket = config.bucket;
        this.providerType = 'gcp';
    }

    async write(key, buffer, mimeType) {
        return this.upload(key, buffer, mimeType);
    }

    async read(key) {
        const url = `https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(key)}?alt=media`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });
        if (!response.ok) throw new Error(`GCP Read Failed: ${await response.text()}`);
        return Buffer.from(await response.arrayBuffer());
    }

    async upload(key, buffer, mimeType) {
        // https://cloud.google.com/storage/docs/json_api/v1/objects/insert
        const url = `https://storage.googleapis.com/upload/storage/v1/b/${this.bucket}/o?uploadType=media&name=${encodeURIComponent(key)}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': mimeType
            },
            body: buffer
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`GCP Upload Failed: ${err}`);
        }

        const data = await response.json();
        return {
            key: key,
            bucket: this.bucket,
            url: data.mediaLink // or selfLink
        };
    }

    async getPresignedUrl(key) {
        // OAuth tokens cannot generate signed URLs (requires Private Key).
        // For now, return the direct link. If the bucket is not public, this won't work for visitors.
        // TODO: Implement Proxy Download or require Service Account Key for GCP.
        return `https://storage.googleapis.com/${this.bucket}/${key}`;
    }

    async delete(key) {
        const url = `https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(key)}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        if (!response.ok) {
            console.warn(`GCP Delete Warning: ${await response.text()}`);
        }
    }
}

class LocalProvider {
    constructor() {
        this.baseDir = path.join(process.cwd(), 'data', 'storage');
        this.providerType = 'local';
    }

    async write(key, buffer) {
        const fullPath = path.join(this.baseDir, key);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, buffer);
        return { key, bucket: 'local', url: `/api/storage/local/${key}` };
    }

    async upload(key, buffer) {
        return this.write(key, buffer);
    }

    async read(key) {
        const fullPath = path.join(this.baseDir, key);
        return await fs.readFile(fullPath);
    }

    async delete(key) {
        const fullPath = path.join(this.baseDir, key);
        await fs.unlink(fullPath).catch(() => { });
    }

    async getPresignedUrl(key) {
        return `/api/storage/local/${key}`;
    }
}

export class StorageManager {
    static async getProvider(userId, providerType = 'default') {
        let selectedType = providerType;
        let credentials = null;

        // 1. Resolve Provider Type from User Settings if default
        if (providerType === 'default') {
            const [user] = await db.select({
                provider: users.storageProvider
            }).from(users).where(eq(users.id, userId));

            selectedType = user?.provider || 'system';
        }

        // 2. System Provider (Shared Bucket)
        if (selectedType === 'system' || selectedType === 'default') {
            // Check for Backblaze system config first
            if (process.env.BACKBLAZE_KEY_ID && process.env.BACKBLAZE_KEY) {
                console.log("[StorageManager] Backblaze credentials found, using B2 S3Provider.");
                const config = {
                    accessKeyId: process.env.BACKBLAZE_KEY_ID,
                    secretAccessKey: process.env.BACKBLAZE_KEY,
                    endpoint: process.env.BACKBLAZE_ENDPOINT || "https://s3.us-east-005.backblazeb2.com",
                    bucket: process.env.BACKBLAZE_BUCKET_NAME || process.env.BACKBLAZE_KEY_NAME || "pegasus-general",
                    region: process.env.BACKBLAZE_REGION || "us-east-005"
                };
                return new S3Provider(config);
            }

            // Fallback to generic AWS/S3 config
            const config = {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION || "us-east-1",
                bucket: process.env.S3_BUCKET_NAME || "pegasus-default-storage",
                endpoint: process.env.S3_ENDPOINT
            };
            if (!config.accessKeyId) {
                console.log("[StorageManager] S3/B2 credentials not found, using LocalProvider.");
                return new LocalProvider();
            }
            console.log("[StorageManager] AWS S3 credentials found, using S3Provider.");
            return new S3Provider(config);
        }

        // 3. BYOS (AWS, GCP, Azure) via SecretService
        // Vault Key Pattern defined in cloud-auth.js: secret/pegasus/users/{userId}/cloud/{provider}/token
        const vaultKey = `secret/pegasus/users/${userId}/cloud/${selectedType}/token`;
        const secretValue = await secretService.getSecret(vaultKey, userId);

        // Also fetch Config for specific resource selection (e.g. which bucket)
        const configKey = `secret/pegasus/users/${userId}/cloud/${selectedType}/config`;
        const configValue = await secretService.getSecret(configKey, userId);
        const userConfig = configValue ? JSON.parse(configValue) : {};

        if (!secretValue && selectedType !== 'backblaze') {
            throw new Error(`No credentials found for ${selectedType}. Please connect your account in Settings.`);
        }

        const creds = secretValue ? JSON.parse(secretValue) : {};

        // Normalize Config based on Provider
        let config = {};
        if (selectedType === 'aws') {
            config = {
                accessKeyId: creds.accessKeyId,
                secretAccessKey: creds.secretAccessKey,
                region: creds.region || 'us-east-1',
                // Use selected bucket, or fall back to system env, or fall back to default name
                bucket: userConfig.storage_bucket || process.env.S3_BUCKET_NAME || `pegasus-byos-${userId}`
            };
            return new S3Provider(config);

        } else if (selectedType === 'gcp') {
            // Check for valid access token
            if (!creds.access_token) {
                throw new Error("Invalid GCP credentials. Please reconnect your account.");
            }

            config = {
                accessToken: creds.access_token,
                bucket: userConfig.storage_bucket || `pegasus-dataset-${userId}` // Default fallback
            };
            return new GCPProvider(config);
        } else if (selectedType === 'backblaze') {
            // Support for Backblaze B2 via S3 API
            // Use specific env vars if available, or credentials from SecretService
            config = {
                accessKeyId: process.env.BACKBLAZE_KEY_ID || creds.accessKeyId,
                secretAccessKey: process.env.BACKBLAZE_KEY || creds.secretAccessKey,
                endpoint: process.env.BACKBLAZE_ENDPOINT || userConfig.endpoint || "https://s3.us-west-004.backblazeb2.com",
                bucket: process.env.BACKBLAZE_BUCKET_NAME || userConfig.storage_bucket || process.env.BACKBLAZE_KEY_NAME || "pegasus-general",
                region: process.env.BACKBLAZE_REGION || userConfig.region || "us-west-004"
            };

            if (!config.accessKeyId || !config.secretAccessKey) {
                throw new Error("Backblaze credentials not found in env or settings.");
            }

            return new S3Provider(config);
        }

        // Default / Fallback
        return new S3Provider(config);
    }

    /**
     * Generates a signed URL (or direct URL) for a storage key.
     * Useful for zero-copy retrieval tools (DuckDB httpfs).
     */
    static async getPublicUrl(userId, key) {
        if (!key) return null;
        if (!key.startsWith('uploads/')) return null;

        const provider = await this.getProvider(userId);
        return provider.getPresignedUrl(key);
    }

    /**
     * Resolves a storage key to an absolute local file path.
     * If the storage is remote (S3/GCP), it downloads the file to a local cache first.
     */
    static async getLocalPath(userId, key) {
        if (!key) return null;
        if (!key.startsWith('uploads/')) return key; // Not a managed upload

        const provider = await this.getProvider(userId);

        // If LocalProvider, just resolve the path
        if (provider.baseDir) {
            return path.resolve(provider.baseDir, key);
        }

        // Remote Provider: Use a local cache outside the watched directory
        const cacheDir = path.join(os.tmpdir(), 'pegasus-storage-cache');
        const localPath = path.join(cacheDir, userId, key);

        try {
            await fs.access(localPath);
            return localPath;
        } catch (e) {
            console.log(`[StorageManager] Downloading remote file to cache: ${key}`);
            await fs.mkdir(path.dirname(localPath), { recursive: true });
            const buffer = await provider.read(key);
            await fs.writeFile(localPath, buffer);
            return localPath;
        }
    }
}
