
import { StorageFactory } from './apps/backend/services/storage/StorageFactory.js';
import { SecretService } from './apps/backend/services/SecretService.js';

async function verifyFactory() {
    console.log('[Verify] Testing StorageFactory...');

    // 1. Test Azure Instantiation
    const azure = StorageFactory.getProvider('azure_blob');
    if (azure.constructor.name === 'AzureBlobProvider') {
        console.log('✅ Azure Provider instantiated');
    } else {
        console.error('❌ Failed to instantiate Azure Provider');
    }

    // 2. Test S3 Instantiation
    const s3 = StorageFactory.getProvider('s3');
    if (s3.constructor.name === 'S3Provider') {
        console.log('✅ S3 Provider instantiated');
    } else {
        console.error('❌ Failed to instantiate S3 Provider');
    }

    // 3. Test GCS Instantiation
    const gcs = StorageFactory.getProvider('gcs');
    if (gcs.constructor.name === 'GCSProvider') {
        console.log('✅ GCS Provider instantiated');
    } else {
        console.error('❌ Failed to instantiate GCS Provider');
    }

    // 4. Test S3 Upload logic (Mock)
    console.log('[Verify] Testing S3 Upload Logic...');
    try {
        await s3.upload('test.json', { foo: 'bar' }, {
            bucket: 'my-bucket',
            accessKey: 'fake-access',
            secretKey: 'fake-secret',
            region: 'us-west-2'
        });
    } catch (e) {
        // Expected error from AWS SDK connecting to non-existent endpoint with fake keys
        // "InvalidAccessKeyId" or "NetworkingError"
        if (e.name === 'InvalidAccessKeyId' || e.message.includes('network') || e.message.includes('Invalid')) {
            console.log(`✅ S3 Client rejected fake keys correctly: ${e.message}`);
        } else {
            console.warn(`❓ S3 Unexpected error: ${e.message}`);
        }
    }
}

verifyFactory().catch(console.error);
