import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'
import { join } from 'path'

// Mock data - Sales records
const salesData = [
    { id: 1, product: 'Laptop', category: 'Electronics', price: 1299.99, quantity: 5, date: '2024-01-15', region: 'North' },
    { id: 2, product: 'Mouse', category: 'Electronics', price: 29.99, quantity: 50, date: '2024-01-16', region: 'South' },
    { id: 3, product: 'Keyboard', category: 'Electronics', price: 79.99, quantity: 30, date: '2024-01-17', region: 'East' },
    { id: 4, product: 'Monitor', category: 'Electronics', price: 399.99, quantity: 15, date: '2024-01-18', region: 'West' },
    { id: 5, product: 'Desk Chair', category: 'Furniture', price: 249.99, quantity: 20, date: '2024-01-19', region: 'North' },
    { id: 6, product: 'Standing Desk', category: 'Furniture', price: 599.99, quantity: 10, date: '2024-01-20', region: 'South' },
    { id: 7, product: 'Webcam', category: 'Electronics', price: 89.99, quantity: 25, date: '2024-01-21', region: 'East' },
    { id: 8, product: 'Headphones', category: 'Electronics', price: 149.99, quantity: 40, date: '2024-01-22', region: 'West' },
    { id: 9, product: 'USB Cable', category: 'Accessories', price: 12.99, quantity: 100, date: '2024-01-23', region: 'North' },
    { id: 10, product: 'Laptop Bag', category: 'Accessories', price: 49.99, quantity: 35, date: '2024-01-24', region: 'South' },
    { id: 11, product: 'External SSD', category: 'Storage', price: 179.99, quantity: 18, date: '2024-01-25', region: 'East' },
    { id: 12, product: 'USB Hub', category: 'Accessories', price: 34.99, quantity: 45, date: '2024-01-26', region: 'West' },
    { id: 13, product: 'Printer', category: 'Electronics', price: 299.99, quantity: 12, date: '2024-01-27', region: 'North' },
    { id: 14, product: 'Desk Lamp', category: 'Furniture', price: 39.99, quantity: 60, date: '2024-01-28', region: 'South' },
    { id: 15, product: 'Notebook', category: 'Stationery', price: 4.99, quantity: 200, date: '2024-01-29', region: 'East' },
]

// Create Excel file
const worksheet = XLSX.utils.json_to_sheet(salesData)
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Data')

// Add some formulas to demonstrate Excel functionality
// Note: These will be in the Excel file but won't show in the initial data
const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
const totalRow = range.e.r + 2 // Two rows below the data

// Add headers for totals
XLSX.utils.sheet_add_aoa(worksheet, [['', '', 'TOTALS:', '', '']], { origin: `A${totalRow + 1}` })

// Add formula for total quantity
XLSX.utils.sheet_add_aoa(worksheet, [[{ f: `SUM(E2:E${range.e.r + 1})` }]], { origin: `E${totalRow + 1}` })

// Write Excel file
const excelPath = join(process.cwd(), 'mock-sales-data.xlsx')
XLSX.writeFile(workbook, excelPath)
console.log(`✅ Excel file created: ${excelPath}`)

// Write JSON file
const jsonPath = join(process.cwd(), 'mock-sales-data.json')
writeFileSync(jsonPath, JSON.stringify(salesData, null, 2))
console.log(`✅ JSON file created: ${jsonPath}`)

console.log('\nMock data files created successfully!')
console.log('You can now upload these files to test the Excel Editor.')
