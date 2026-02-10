import { db } from './apps/backend/src/db/index.js';
import { users, userPayments, transactionMaster } from './apps/backend/src/db/schema.js';
import { eq } from 'drizzle-orm';

async function checkUser(email) {
    try {
        console.log(`Checking user: ${email}`);
        const user = await db.query.users.findFirst({
            where: eq(users.email, email)
        });

        if (!user) {
            console.log('User not found.');
            process.exit(0);
        }

        console.log('User found:');
        console.log(JSON.stringify(user, null, 2));

        console.log('\nChecking payments:');
        const payments = await db.select().from(userPayments).where(eq(userPayments.userId, user.id));
        console.log(JSON.stringify(payments, null, 2));

        console.log('\nChecking transactions:');
        const transactions = await db.select().from(transactionMaster).where(eq(transactionMaster.userId, user.id));
        console.log(JSON.stringify(transactions, null, 2));

        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

const email = 'batsteel209@gmail.com';
checkUser(email);
