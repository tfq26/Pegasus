
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { join } from "path";
import { readFileSync } from "fs";

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

const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: true
});

async function findKeys() {
    console.log(`Searching for keys in bucket: ${config.bucket}`);
    const command = new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: "uploads/"
    });

    try {
        const data = await client.send(command);
        console.log(`Found ${data.Contents?.length || 0} objects with prefix 'uploads/'`);
        data.Contents?.forEach(obj => {
            console.log(` - ${obj.Key}`);
        });

        const searchUser = "user_01K8FGQG2NSJZJ7K38QFBS8CJD";
        const userObjects = data.Contents?.filter(obj => obj.Key.includes(searchUser));
        console.log(`\nFound ${userObjects?.length || 0} objects for user: ${searchUser}`);
        userObjects?.forEach(obj => {
            console.log(` - ${obj.Key}`);
        });

    } catch (e) {
        console.error("List failed:", e.message);
    }
}

findKeys();
