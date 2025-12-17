import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'
import { join } from 'path'

// ============================================================================
// TEST DATA SETS FOR UNIVERSAL DATA EDITOR
// ============================================================================

// Dataset 1: Sales Data (with clear headers - tests named-headers mode)
const salesData = [
    { Name: 'John Smith', Age: 28, Department: 'Sales', Salary: 65000, City: 'New York', Status: 'Active' },
    { Name: 'Jane Doe', Age: 34, Department: 'Marketing', Salary: 72000, City: 'Los Angeles', Status: 'Active' },
    { Name: 'Bob Johnson', Age: 45, Department: 'Engineering', Salary: 95000, City: 'San Francisco', Status: 'Active' },
    { Name: 'Alice Williams', Age: 29, Department: 'Sales', Salary: 68000, City: 'Chicago', Status: 'Active' },
    { Name: 'Charlie Brown', Age: 52, Department: 'Management', Salary: 120000, City: 'Boston', Status: 'Active' },
    { Name: 'Diana Prince', Age: 31, Department: 'Engineering', Salary: 88000, City: 'Seattle', Status: 'Active' },
    { Name: 'Eve Anderson', Age: 27, Department: 'Marketing', Salary: 70000, City: 'Austin', Status: 'Active' },
    { Name: 'Frank Miller', Age: 38, Department: 'Sales', Salary: 75000, City: 'Denver', Status: 'Active' },
    { Name: 'Grace Lee', Age: 42, Department: 'Engineering', Salary: 92000, City: 'Portland', Status: 'Active' },
    { Name: 'Henry Davis', Age: 33, Department: 'Marketing', Salary: 71000, City: 'Miami', Status: 'Active' },
]

// Dataset 2: Product Inventory (tests AI operations like calculations)
const inventoryData = [
    { Product: 'Laptop', Category: 'Electronics', Price: 1299.99, Stock: 45, Supplier: 'TechCorp', LastRestocked: '2024-01-15' },
    { Product: 'Mouse', Category: 'Electronics', Price: 29.99, Stock: 150, Supplier: 'TechCorp', LastRestocked: '2024-01-20' },
    { Product: 'Keyboard', Category: 'Electronics', Price: 79.99, Stock: 89, Supplier: 'TechCorp', LastRestocked: '2024-01-18' },
    { Product: 'Monitor', Category: 'Electronics', Price: 399.99, Stock: 32, Supplier: 'DisplayPro', LastRestocked: '2024-01-22' },
    { Product: 'Desk Chair', Category: 'Furniture', Price: 249.99, Stock: 28, Supplier: 'OfficePlus', LastRestocked: '2024-01-10' },
    { Product: 'Standing Desk', Category: 'Furniture', Price: 599.99, Stock: 15, Supplier: 'OfficePlus', LastRestocked: '2024-01-12' },
    { Product: 'Webcam', Category: 'Electronics', Price: 89.99, Stock: 67, Supplier: 'TechCorp', LastRestocked: '2024-01-25' },
    { Product: 'Headphones', Category: 'Electronics', Price: 149.99, Stock: 103, Supplier: 'AudioMax', LastRestocked: '2024-01-23' },
]

// Dataset 3: Customer Orders (tests data cleaning operations)
const ordersData = [
    { OrderID: 'ORD-001', Customer: 'ACME Corp', Amount: 5420.50, Status: 'completed', Date: '2024-01-15', Notes: 'Rush order' },
    { OrderID: 'ORD-002', Customer: 'TechStart Inc', Amount: 3200.00, Status: 'pending', Date: '2024-01-16', Notes: '' },
    { OrderID: 'ORD-003', Customer: 'Global Solutions', Amount: 8750.25, Status: 'completed', Date: '2024-01-17', Notes: 'Bulk discount applied' },
    { OrderID: 'ORD-004', Customer: 'ACME Corp', Amount: 2100.00, Status: 'completed', Date: '2024-01-18', Notes: '' },
    { OrderID: 'ORD-005', Customer: 'StartupXYZ', Amount: 4500.00, Status: 'cancelled', Date: '2024-01-19', Notes: 'Customer requested cancellation' },
    { OrderID: 'ORD-006', Customer: 'TechStart Inc', Amount: 6300.75, Status: 'pending', Date: '2024-01-20', Notes: '' },
    { OrderID: 'ORD-007', Customer: 'Global Solutions', Amount: 9200.00, Status: 'completed', Date: '2024-01-21', Notes: 'VIP customer' },
]

// Dataset 4: Simple numeric data (tests column-letters mode)
const numericData = [
    { A: 100, B: 200, C: 300, D: 400 },
    { A: 150, B: 250, C: 350, D: 450 },
    { A: 120, B: 220, C: 320, D: 420 },
    { A: 180, B: 280, C: 380, D: 480 },
    { A: 110, B: 210, C: 310, D: 410 },
]

// ============================================================================
// GENERATE FILES
// ============================================================================

console.log('🚀 Generating test data for Universal Data Editor...\n')

// 1. Employee Data (Excel + JSON)
const employeeWorkbook = XLSX.utils.book_new()
const employeeSheet = XLSX.utils.json_to_sheet(salesData)
XLSX.utils.book_append_sheet(employeeWorkbook, employeeSheet, 'Employees')
XLSX.writeFile(employeeWorkbook, 'test-employees.xlsx')
writeFileSync('test-employees.json', JSON.stringify(salesData, null, 2))
console.log('✅ Created: test-employees.xlsx & test-employees.json')
console.log('   Purpose: Test named-headers mode with employee data')
console.log('   AI Tests: Convert names to uppercase, calculate average salary\n')

// 2. Inventory Data (Excel + JSON)
const inventoryWorkbook = XLSX.utils.book_new()
const inventorySheet = XLSX.utils.json_to_sheet(inventoryData)
XLSX.utils.book_append_sheet(inventoryWorkbook, inventorySheet, 'Inventory')
XLSX.writeFile(inventoryWorkbook, 'test-inventory.xlsx')
writeFileSync('test-inventory.json', JSON.stringify(inventoryData, null, 2))
console.log('✅ Created: test-inventory.xlsx & test-inventory.json')
console.log('   Purpose: Test calculations and formatting')
console.log('   AI Tests: Calculate total stock value, format prices\n')

// 3. Orders Data (Excel + JSON)
const ordersWorkbook = XLSX.utils.book_new()
const ordersSheet = XLSX.utils.json_to_sheet(ordersData)
XLSX.utils.book_append_sheet(ordersWorkbook, ordersSheet, 'Orders')
XLSX.writeFile(ordersWorkbook, 'test-orders.xlsx')
writeFileSync('test-orders.json', JSON.stringify(ordersData, null, 2))
console.log('✅ Created: test-orders.xlsx & test-orders.json')
console.log('   Purpose: Test data cleaning operations')
console.log('   AI Tests: Fill blank notes, remove duplicates, uppercase status\n')

// 4. Numeric Data (Excel + JSON) - Column Letters Mode
const numericWorkbook = XLSX.utils.book_new()
const numericSheet = XLSX.utils.json_to_sheet(numericData)
XLSX.utils.book_append_sheet(numericWorkbook, numericSheet, 'Data')
XLSX.writeFile(numericWorkbook, 'test-numeric.xlsx')
writeFileSync('test-numeric.json', JSON.stringify(numericData, null, 2))
console.log('✅ Created: test-numeric.xlsx & test-numeric.json')
console.log('   Purpose: Test column-letters mode (A, B, C, D)')
console.log('   AI Tests: Calculate row sums, multiply columns\n')

// 5. Combined workbook with multiple sheets
const combinedWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(combinedWorkbook, XLSX.utils.json_to_sheet(salesData), 'Employees')
XLSX.utils.book_append_sheet(combinedWorkbook, XLSX.utils.json_to_sheet(inventoryData), 'Inventory')
XLSX.utils.book_append_sheet(combinedWorkbook, XLSX.utils.json_to_sheet(ordersData), 'Orders')
XLSX.writeFile(combinedWorkbook, 'test-combined.xlsx')
console.log('✅ Created: test-combined.xlsx')
console.log('   Purpose: Test multi-sheet workbook handling\n')

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📊 ALL TEST FILES GENERATED SUCCESSFULLY!')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('🧪 TESTING GUIDE:')
console.log('─────────────────────────────────────────────────────')
console.log('1. Upload test-employees.xlsx')
console.log('   → Should detect "named-headers" mode')
console.log('   → Row 0 should show: Name, Age, Department, etc.')
console.log('')
console.log('2. Upload test-numeric.xlsx')
console.log('   → Should detect "column-letters" mode')
console.log('   → Columns should be: A, B, C, D')
console.log('')
console.log('3. Test AI Operations:')
console.log('   → Select "Name" column → Ask AI: "convert to uppercase"')
console.log('   → Select "Salary" column → Ask AI: "calculate average"')
console.log('   → Select "Notes" column → Ask AI: "fill blank cells with N/A"')
console.log('')
console.log('4. Test Cross-Provider:')
console.log('   → Upload to SurrealDB')
console.log('   → Load from MySQL/PostgreSQL')
console.log('   → Verify consistent behavior')
console.log('─────────────────────────────────────────────────────\n')
