import ExcelJS from 'exceljs';

async function inspect() {
    const workbook = new ExcelJS.Workbook();
    const filePath = '/Users/taufeeqali/Projects/Pegasus/Pegasus-Application/PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx';
    console.log('Reading:', filePath);

    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    console.log('\n=== WORKSHEET INFO ===');
    console.log('Name:', worksheet.name);
    console.log('Row Count:', worksheet.rowCount);
    console.log('Column Count:', worksheet.columnCount);

    console.log('\n=== ROW-BY-ROW ANALYSIS (First 10 rows) ===');
    for (let i = 1; i <= 10; i++) {
        const row = worksheet.getRow(i);
        let filledCount = 0;
        let numericCount = 0;
        let textCount = 0;
        const values = [];

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            if (cell.value) {
                filledCount++;
                const val = String(cell.value).trim();
                if (!isNaN(Number(val)) && val !== '') {
                    numericCount++;
                } else {
                    textCount++;
                }
                values.push(`[${colNumber}]=${val.substring(0, 20)}`);
            }
        });

        console.log(`\nRow ${i}: ${filledCount} filled (${textCount} text, ${numericCount} numeric)`);
        console.log(`  Values: ${values.join(', ')}`);
    }

    console.log('\n=== COLUMN HEADERS EXPECTED (Row 5) ===');
    const headerRow = worksheet.getRow(5);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers.push(`[${colNumber}] ${cell.value || '(empty)'}`);
    });
    console.log(headers.join('\n'));
}

inspect().catch(console.error);
