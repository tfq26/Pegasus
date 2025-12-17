import { createClient } from "@libsql/client";

const url = process.env.TURSO_UPLOAD_DB_URL;
const authToken = process.env.TURSO_UPLOAD_TOKEN;

// Only initialize if configured, otherwise export a dummy or throw helpful error on access
export const uploadsDb = (url && authToken)
    ? createClient({ url, authToken })
    : {
        execute: async () => {
            console.warn('[UploadsDB] Missing TURSO_UPLOAD_DB_URL or TURSO_UPLOAD_TOKEN. Upload verification disabled.');
            return { rows: [] };
        }
    };
