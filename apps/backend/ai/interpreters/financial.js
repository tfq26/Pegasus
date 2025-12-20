
/**
 * specialized interpreter for financial portfolio data.
 * Validates calculations (Units * NAV = Value) and generates portfolio insights.
 */
export async function interpretFinancialPortfolio(rows, columnAnalysis) {
    // Helper to find a column by semantic keywords and optional data type check
    const findCol = (keywords, exclude = [], type = null) => {
        // First try to find exact matches with type check
        let match = columnAnalysis.find(c => {
            const name = (c.semantic_name || c.column_name).toLowerCase();
            // detailed match
            const keywordMatch = keywords.some(k => name.includes(k));
            const excludeMatch = exclude.some(e => name.includes(e));
            const typeMatch = type ? (c.data_type === type || c.data_type === 'number' || c.data_type === 'currency') : true;

            return keywordMatch && !excludeMatch && typeMatch;
        });

        return match ? match.column_name : null;
    };

    // Identify key financial columns
    const cols = {
        investment: findCol(['invest', 'princ', 'cost'], ['date'], 'currency'),
        units: findCol(['unit', 'qty', 'quantity'], ['price', 'nav'], 'number'),
        nav: findCol(['nav', 'price', 'rate'], ['unit', 'purchase'], 'number'), // NAV can be currency or number
        currentValue: findCol(['current', 'value', 'market', 'worth'], ['nav', 'price'], 'currency'),
        gainLoss: findCol(['gain', 'loss', 'profit'], [], 'currency'),
        returnPct: findCol(['return', '%', 'pct', 'yield'], [], 'percentage')
    };

    console.log('[FinancialInterpreter] Identified columns:', cols);

    // 1. Validate Calculations
    // We check if the math holds up:
    // A) Units * NAV ~= Current Value
    // B) Current Value - Investment ~= Gain/Loss
    const validations = [];

    // Only validate if we found the necessary columns
    if (cols.units && cols.nav && cols.currentValue) {
        const errors = [];
        rows.forEach((row, idx) => {
            const units = parseFloat(row[cols.units] || 0);
            const nav = parseFloat(row[cols.nav] || 0);
            const val = parseFloat(row[cols.currentValue] || 0);

            // Allow 1% variance for rounding diffs
            const expected = units * nav;
            if (Math.abs(expected - val) > (val * 0.01 + 1)) {
                errors.push({
                    row: idx + 1,
                    message: `Value mismatch: Units(${units}) * NAV(${nav}) = ${expected.toFixed(2)}, but found ${val}`
                });
            }
        });

        validations.push({
            rule: "Units * NAV = Current Value",
            isValid: errors.length === 0,
            errorCount: errors.length,
            errors: errors.slice(0, 5) // Limits errors shown
        });
    }

    if (cols.investment && cols.currentValue && cols.gainLoss) {
        const errors = [];
        rows.forEach((row, idx) => {
            const inv = parseFloat(row[cols.investment] || 0);
            const val = parseFloat(row[cols.currentValue] || 0);
            const gl = parseFloat(row[cols.gainLoss] || 0);

            const expected = val - inv;
            if (Math.abs(expected - gl) > 1) { // 1 unit tolerance
                errors.push({
                    row: idx + 1,
                    message: `Gain/Loss mismatch: Value(${val}) - Inv(${inv}) = ${expected.toFixed(2)}, but found ${gl}`
                });
            }
        });
        validations.push({
            rule: "Current Value - Investment = Gain/Loss",
            isValid: errors.length === 0,
            errorCount: errors.length,
            errors: errors.slice(0, 5)
        });
    }

    // 2. Generate Insights
    // Calculate portfolio aggregate stats
    const totalInvestment = cols.investment ? rows.reduce((acc, r) => acc + (parseFloat(r[cols.investment]) || 0), 0) : 0;
    const totalCurrentValue = cols.currentValue ? rows.reduce((acc, r) => acc + (parseFloat(r[cols.currentValue]) || 0), 0) : 0;
    const totalGainLoss = cols.gainLoss ? rows.reduce((acc, r) => acc + (parseFloat(r[cols.gainLoss]) || 0), 0) : totalCurrentValue - totalInvestment;

    const overallReturn = totalInvestment > 0 ? (totalGainLoss / totalInvestment) * 100 : 0;

    // Find best/worst performers if return% column exists
    let bestPerformer = null;
    let worstPerformer = null;

    if (cols.returnPct) {
        rows.forEach(r => {
            const ret = parseFloat(r[cols.returnPct] || 0);
            if (!bestPerformer || ret > parseFloat(bestPerformer[cols.returnPct] || -Infinity)) bestPerformer = r;
            if (!worstPerformer || ret < parseFloat(worstPerformer[cols.returnPct] || Infinity)) worstPerformer = r;
        });
    }

    const insights = [
        {
            title: "Portfolio Value",
            value: formatCurrency(totalCurrentValue),
            description: `Total current value across ${rows.length} holdings.`
        },
        {
            title: "Total Gain/Loss",
            value: formatCurrency(totalGainLoss),
            description: `${overallReturn.toFixed(2)}% overall return on investment.`
        }
    ];

    if (bestPerformer && cols.returnPct) {
        // Try to identify a name column for the description
        const nameCol = columnAnalysis.find(c => c.semantic_name.toLowerCase().includes('name') || c.role === 'identifier')?.column_name;
        const name = nameCol ? bestPerformer[nameCol] : 'Fund';

        insights.push({
            title: "Top Performer",
            value: `${parseFloat(bestPerformer[cols.returnPct]).toFixed(2)}%`,
            description: `${name} had the highest return.`
        });
    }

    return {
        validation: {
            rules: validations,
            status: validations.every(v => v.isValid) ? 'valid' : 'warnings'
        },
        insights,
        derived_metrics: {
            totalInvestment,
            totalCurrentValue,
            totalGainLoss,
            overallReturnPct: overallReturn
        }
    };
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
}
