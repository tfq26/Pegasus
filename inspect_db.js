
import { Surreal } from 'surrealdb';

const db = new Surreal();

async function test() {
    try {
        await db.connect('ws://127.0.0.1:8000/rpc');
        await db.signin({ username: 'root', password: 'root' });
        await db.use({ namespace: 'test', database: 'test' });

        const [logs] = await db.query('SELECT * FROM debug_log ORDER BY time DESC LIMIT 10');
        console.log('Debug Logs:', JSON.stringify(logs, null, 2));
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await db.close();
    }
}

test();
