
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
import { join } from "path";
import { readFileSync } from "fs";

// Manually load .env since we are in a sub-script
const envPath = join(process.cwd(), "apps", "backend", ".env");
const envFile = readFileSync(envPath, "utf8");
envFile.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join("=").trim();
        }
    }
});

const config = {
    accessKeyId: process.env.BACKBLAZE_KEY_ID,
    secretAccessKey: process.env.BACKBLAZE_KEY,
    endpoint: process.env.BACKBLAZE_ENDPOINT,
    bucket: process.env.BACKBLAZE_BUCKET_NAME,
    region: process.env.BACKBLAZE_REGION
};

console.log("Testing with config:", { ...config, secretAccessKey: "****" });

const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: true
});

async function test() {
    // Try to list objects first to verify basic access
    try {
        const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
        const listCmd = new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 5 });
        const listData = await client.send(listCmd);
        console.log("✅ Basic connectivity: ListObjectsV2 successful.");
        console.log("Found objects:", listData.Contents?.map(c => c.Key));
    } catch (e) {
        console.error("❌ Basic connectivity failed (ListObjectsV2):", e.message);
    }

    // Try to generate a signed URL for one of the failing files
    const testKey = "uploads/user_01K8FGQG2NSJZJ7K38QFBS8CJD/7fb40f6b-014b-4311-8eec-0809d4407588-MarketIndices2024.csv";
    const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: testKey,
    });

    try {
        const url = await getSignedUrl(client, command, { expiresIn: 3600 });
        console.log("\nGenerated Signed URL:");
        console.log(url);

        console.log("\nTesting URL via fetch (HEAD request)...");
        const res = await fetch(url, { method: 'HEAD' });
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.status === 403) {
            console.log("Still getting 403. Details:");
            // Try GET to get the error body
            const getRes = await fetch(url);
            console.log(await getRes.text());
        }
    } catch (e) {
        console.error("❌ Signed URL generation or test failed:", e.message);
    }
}

test();
