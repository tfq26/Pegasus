
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
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

const client = new S3Client({
    region: process.env.BACKBLAZE_REGION,
    endpoint: process.env.BACKBLAZE_ENDPOINT,
    credentials: {
        accessKeyId: process.env.BACKBLAZE_KEY_ID,
        secretAccessKey: process.env.BACKBLAZE_KEY
    },
    forcePathStyle: true
});

async function listBuckets() {
    try {
        const data = await client.send(new ListBucketsCommand({}));
        console.log("Available Buckets:");
        data.Buckets.forEach(b => console.log(` - ${b.Name}`));
    } catch (e) {
        console.error("List Buckets failed:", e.message);
    }
}

listBuckets();
