
import { db } from './apps/backend/src/db/index.js';
import { users } from './apps/backend/src/db/schema.js';
import { eq } from 'drizzle-orm';

async function testUpdateId() {
    try {
        const testEmail = 'test_id_update@example.com';
        const oldId = 'old_id_123';
        const newId = 'new_id_456';

        console.log('Inserting test user...');
        await db.insert(users).values({
            id: oldId,
            email: testEmail,
            subscriptionTier: 'pro'
        }).onConflictDoNothing();

        console.log('Attempting to update ID...');
        const result = await db.update(users)
            .set({ id: newId })
            .where(eq(users.id, oldId))
            .returning();

        console.log('Update result:', JSON.stringify(result[0], null, 2));

        console.log('Cleaning up...');
        await db.delete(users).where(eq(users.id, newId));

        process.exit(0);
    } catch (e) {
        console.error('Update failed:', e.message);
        process.exit(1);
    }
}

testUpdateId();
