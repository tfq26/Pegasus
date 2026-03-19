import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { db } from './src/db/index.js';
import { connections } from './src/db/schema.js';
import { eq, count } from 'drizzle-orm';

async function checkConnections() {
    try {
        const [result] = await db.select({ total: count() })
            .from(connections)
            .where(eq(connections.userId, 'dev_user'));
        
        console.log(`Total connections for dev_user: ${result?.total || 0}`);
        
        const allConns = await db.select().from(connections).where(eq(connections.userId, 'dev_user'));
        console.log('Connections detail:');
        allConns.forEach(c => {
            console.log(`- ID: ${c.id}, Name: ${c.name}, CreatedAt: ${c.createdAt}`);
        });

        process.exit(0);
    } catch (e) {
        console.error('Error checking connections:', e);
        process.exit(1);
    }
}

checkConnections();
