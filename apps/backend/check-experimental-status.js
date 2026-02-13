import { db } from './src/db/index.js';
import { users, experimentalRequests, experimentalAccess } from './src/db/schema.js';
import { desc } from 'drizzle-orm';

async function checkStatus() {
    try {
        console.log('--- USERS ---');
        const allUsers = await db.select().from(users).limit(5);
        console.table(allUsers.map(u => ({ id: u.id, email: u.email, tier: u.subscriptionTier })));

        console.log('\n--- EXPERIMENTAL ACCESS ---');
        const access = await db.select().from(experimentalAccess);
        console.table(access);

        console.log('\n--- EXPERIMENTAL REQUESTS ---');
        const requests = await db.select().from(experimentalRequests).orderBy(desc(experimentalRequests.requestedAt)).limit(5);
        console.table(requests);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkStatus();
