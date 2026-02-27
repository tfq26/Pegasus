
import dotenv from 'dotenv';
import path from 'path';
import { StorageFactory } from './apps/backend/services/storage/StorageFactory.js';
import { SecretService, secretService } from './apps/backend/services/SecretService.js';

// Load env vars (try default .env and apps/backend/.env)
dotenv.config();
dotenv.config({ path: 'apps/backend/.env' });

async function runCloudVerification() {
    console.log('☁️  Starting Cloud Provider Verification...');
    console.log('-------------------------------------------');

    const testData = {
        meta: {
            timestamp: new Date().toISOString(),
            test: 'Multi-Cloud Verification',
            user: 'Pegasus Admin'
        },
        rows: [
            { id: 1, name: 'Cloud Test Item' },
            { id: 2, value: 123.45 }
        ]
    };
    const testFilename = `pegasus_verify_${Date.now()}.json`;

    // --- 1. AZURE ---
    console.log('\n🔵 Testing Azure Blob Storage...');
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        try {
            const provider = StorageFactory.getProvider('azure_blob');
            const result = await provider.upload(testFilename, testData, {
                connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
                bucket: process.env.AZURE_CONTAINER_NAME || 'pegasus-tests'
            });
            console.log('✅ Azure Upload Success:', result);
        } catch (e) {
            console.error('❌ Azure Failed:', e.message);
        }
    } else {
        console.log('⚠️  Skipping Azure: AZURE_STORAGE_CONNECTION_STRING not set');
    }

    // --- 2. AWS S3 ---
    console.log('\n🔶 Testing AWS S3...');
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET) {
        try {
            const provider = StorageFactory.getProvider('s3');
            const result = await provider.upload(testFilename, testData, {
                accessKey: process.env.AWS_ACCESS_KEY_ID,
                secretKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION || 'us-east-1',
                bucket: process.env.AWS_S3_BUCKET
            });
            console.log('✅ S3 Upload Success:', result);
        } catch (e) {
            console.error('❌ S3 Failed:', e.message);
        }
    } else {
        console.log('⚠️  Skipping S3: AWS_ACCESS_KEY_ID/SECRET/BUCKET missing');
    }

    // --- 3. Google Cloud Storage ---
    console.log('\n🟩 Testing Google Cloud Storage...');
    const gcpKey = process.env.GCP_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const gcpBucket = process.env.GCP_BUCKET_NAME;

    if (gcpKey && gcpBucket) {
        try {
            const provider = StorageFactory.getProvider('gcs');
            // Try to determine if key is JSON content or filepath (simplified check)
            let config = { bucket: gcpBucket };
            if (gcpKey.trim().startsWith('{')) {
                config.credentialsJSON = gcpKey;
            } else {
                config.keyFilename = gcpKey;
            }

            const result = await provider.upload(testFilename, testData, config);
            console.log('✅ GCS Upload Success:', result);
        } catch (e) {
            console.error('❌ GCS Failed:', e.message);
        }
    } else {
        console.log('⚠️  Skipping GCS: GCP_SERVICE_ACCOUNT_KEY or GCP_BUCKET_NAME missing');
    }

    console.log('\n-------------------------------------------');
    console.log('Verification Finished.');
}

runCloudVerification().catch(e => console.error(e));
