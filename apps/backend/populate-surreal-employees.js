
import { Surreal } from 'surrealdb';

const db = new Surreal();


const url = 'wss://hidden-panther-06dhsq7jidpo353rqjk0376cvo.aws-use1.surreal.cloud/rpc';
const user = 'taufeeq26';
const pass = 'r:TdQsMb4d7U!wM';
const ns = 'main';
const dbName = 'main';


const salesData = [
    { name: 'John Smith', age: 28, department: 'Sales', salary: 65000, city: 'New York', status: 'Active' },
    { name: 'Jane Doe', age: 34, department: 'Marketing', salary: 72000, city: 'Los Angeles', status: 'Active' },
    { name: 'Bob Johnson', age: 45, department: 'Engineering', salary: 95000, city: 'San Francisco', status: 'Active' },
    { name: 'Alice Williams', age: 29, department: 'Sales', salary: 68000, city: 'Chicago', status: 'Active' },
    { name: 'Charlie Brown', age: 52, department: 'Management', salary: 120000, city: 'Boston', status: 'Active' },
    { name: 'Diana Prince', age: 31, department: 'Engineering', salary: 88000, city: 'Seattle', status: 'Active' },
    { name: 'Eve Anderson', age: 27, department: 'Marketing', salary: 70000, city: 'Austin', status: 'Active' },
    { name: 'Frank Miller', age: 38, department: 'Sales', salary: 75000, city: 'Denver', status: 'Active' },
    { name: 'Grace Lee', age: 42, department: 'Engineering', salary: 92000, city: 'Portland', status: 'Active' },
    { name: 'Henry Davis', age: 33, department: 'Marketing', salary: 71000, city: 'Miami', status: 'Active' },
];

async function main() {
    try {
        console.log(`Make sure SurrealDB is running at ${url}`);
        await db.connect(url);
        await db.signin({ username: user, password: pass });
        await db.use({ namespace: ns, database: dbName });

        console.log('Connected. Populating data...');

        // Clear existing table
        await db.query('DELETE employee; DELETE inventory; DELETE orders;');
        console.log('Cleared existing tables.');

        // Insert Employees
        // We use INSERT because it allows inserting an array
        await db.query('INSERT INTO employee $data', { data: salesData });
        console.log(`Inserted ${salesData.length} employees.`);

        // Insert Inventory (lowercase keys)
        const inventoryData = [
            { product: 'Laptop', category: 'Electronics', price: 1299.99, stock: 45, supplier: 'TechCorp', last_restocked: '2024-01-15' },
            { product: 'Mouse', category: 'Electronics', price: 29.99, stock: 150, supplier: 'TechCorp', last_restocked: '2024-01-20' },
            { product: 'Keyboard', category: 'Electronics', price: 79.99, stock: 89, supplier: 'TechCorp', last_restocked: '2024-01-18' },
            { product: 'Monitor', category: 'Electronics', price: 399.99, stock: 32, supplier: 'DisplayPro', last_restocked: '2024-01-22' },
            { product: 'Desk Chair', category: 'Furniture', price: 249.99, stock: 28, supplier: 'OfficePlus', last_restocked: '2024-01-10' },
            { product: 'Standing Desk', category: 'Furniture', price: 599.99, stock: 15, supplier: 'OfficePlus', last_restocked: '2024-01-12' },
            { product: 'Webcam', category: 'Electronics', price: 89.99, stock: 67, supplier: 'TechCorp', last_restocked: '2024-01-25' },
            { product: 'Headphones', category: 'Electronics', price: 149.99, stock: 103, supplier: 'AudioMax', last_restocked: '2024-01-23' },
        ];
        await db.query('INSERT INTO inventory $data', { data: inventoryData });
        console.log(`Inserted ${inventoryData.length} inventory items.`);

        // Insert Orders
        const ordersData = [
            { order_id: 'ORD-001', customer: 'ACME Corp', amount: 5420.50, status: 'completed', date: '2024-01-15', notes: 'Rush order' },
            { order_id: 'ORD-002', customer: 'TechStart Inc', amount: 3200.00, status: 'pending', date: '2024-01-16', notes: '' },
            { order_id: 'ORD-003', customer: 'Global Solutions', amount: 8750.25, status: 'completed', date: '2024-01-17', notes: 'Bulk discount applied' },
            { order_id: 'ORD-004', customer: 'ACME Corp', amount: 2100.00, status: 'completed', date: '2024-01-18', notes: '' },
            { order_id: 'ORD-005', customer: 'StartupXYZ', amount: 4500.00, status: 'cancelled', date: '2024-01-19', notes: 'Customer requested cancellation' },
            { order_id: 'ORD-006', customer: 'TechStart Inc', amount: 6300.75, status: 'pending', date: '2024-01-20', notes: '' },
            { order_id: 'ORD-007', customer: 'Global Solutions', amount: 9200.00, status: 'completed', date: '2024-01-21', notes: 'VIP customer' },
        ];
        await db.query('INSERT INTO orders $data', { data: ordersData });
        console.log(`Inserted ${ordersData.length} orders.`);

        await db.close();
        console.log('Done.');
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
