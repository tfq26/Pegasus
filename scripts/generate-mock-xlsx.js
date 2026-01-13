import ExcelJS from 'exceljs';
import path from 'path';

async function generateMockExcel() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mock Data');

    sheet.columns = [
        { header: 'ID', key: 'id' },
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Role', key: 'role' },
    ];

    sheet.addRow({ id: 1, name: 'Alice', email: 'alice@example.com', role: 'Admin' });
    sheet.addRow({ id: 2, name: 'Bob', email: 'bob@example.com', role: 'User' });
    sheet.addRow({ id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'Editor' });
    sheet.addRow({ id: 4, name: 'David', email: 'david@example.com', role: 'User' });
    sheet.addRow({ id: 5, name: 'Eve', email: 'eve@example.com', role: 'Admin' });

    const filePath = path.join(process.cwd(), 'mock_test_data.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log(`✅ Mock Excel file generated at: ${filePath}`);
}

generateMockExcel().catch(console.error);
