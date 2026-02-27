
import { db } from './apps/backend/src/db/index.js';
import { users } from './apps/backend/src/db/schema.js';
import { eq } from 'drizzle-orm';

async function grantPro(email) {
    try {
        console.log(`Granting Pro to: ${email}`);
        const result = await db.update(users)
            .set({
                subscriptionTier: 'pro',
                updatedAt: new Date()
            })
            .where(eq(users.email, email))
            .returning();

        if (result.length === 0) {
            console.log('User not found.');
            process.exit(0);
        }

        console.log('Update success:');
        console.log(JSON.stringify(result[0], null, 2));
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

const email = 'batsteel209@gmail.com';
grantPro(email);
