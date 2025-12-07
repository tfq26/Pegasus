import type { CellPosition } from './types';

// Regular expressions for parsing
const REF_REGEX = /([A-Z]+)([0-9]+)/; // Matches A1, BB23
const RANGE_REGEX = /([A-Z]+[0-9]+):([A-Z]+[0-9]+)/g; // Matches A1:B10

// Helper to convert column letter to index (A -> 0, B -> 1, AA -> 26)
export const colLabelToIndex = (label: string): number => {
    let result = 0;
    for (let i = 0; i < label.length; i++) {
        result = result * 26 + (label.charCodeAt(i) - 64);
    }
    return result - 1;
};

// Helper to convert index to column letter (0 -> A, 26 -> AA)
export const colIndexToLabel = (index: number): string => {
    let label = '';
    let i = index;
    while (i >= 0) {
        label = String.fromCharCode(65 + (i % 26)) + label;
        i = Math.floor(i / 26) - 1;
    }
    return label;
};

// Parse cell reference like "A1" to position
export const parseCellRef = (ref: string): CellPosition | null => {
    const match = ref.match(REF_REGEX);
    if (!match) return null;
    const [, colStr, rowStr] = match;
    if (!colStr || !rowStr) return null;
    return {
        col: colLabelToIndex(colStr),
        row: parseInt(rowStr) - 1
    };
};

// Parse range like "A1:B10" to start and end positions
export const parseRange = (rangeStr: string): { start: CellPosition, end: CellPosition } | null => {
    const parts = rangeStr.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const start = parseCellRef(parts[0]);
    const end = parseCellRef(parts[1]);
    if (!start || !end) return null;
    return { start, end };
};

export interface ParsedFormula {
    references: CellPosition[];
    ranges: { start: CellPosition, end: CellPosition }[];
    evaluate: (getValue: (pos: CellPosition) => any) => any;
}

export class FormulaParser {
    /**
     * Extract all cell references and ranges from a formula
     */
    extractReferences(formula: string): { cells: CellPosition[], ranges: { start: CellPosition, end: CellPosition }[] } {
        const cells: CellPosition[] = [];
        const ranges: { start: CellPosition, end: CellPosition }[] = [];

        if (!formula.startsWith('=')) return { cells, ranges };

        const formulaBody = formula.substring(1).toUpperCase();

        // Extract ranges first
        const rangeMatches = formulaBody.matchAll(RANGE_REGEX);
        for (const match of rangeMatches) {
            const range = parseRange(match[0]);
            if (range) ranges.push(range);
        }

        // Extract individual cell references (excluding those in ranges)
        const cellMatches = formulaBody.matchAll(/[A-Z]+[0-9]+/g);
        for (const match of cellMatches) {
            // Skip if this cell is part of a range
            const isInRange = ranges.some(r => formulaBody.includes(`${match[0]}:`));
            if (!isInRange) {
                const cell = parseCellRef(match[0]);
                if (cell) cells.push(cell);
            }
        }

        return { cells, ranges };
    }

    /**
     * Parse and evaluate a formula
     */
    parse(expression: string): ParsedFormula {
        if (!expression.startsWith('=')) {
            return {
                references: [],
                ranges: [],
                evaluate: () => expression, // Not a formula
            };
        }

        const formulaBody = expression.substring(1).toUpperCase();
        const { cells, ranges } = this.extractReferences(expression);

        return {
            references: cells,
            ranges,
            evaluate: (getValue) => {
                try {
                    return this.evaluateExpression(formulaBody, getValue);
                } catch (e) {
                    return '#ERROR!';
                }
            }
        };
    }

    /**
     * Evaluate an expression with proper operator precedence
     */
    private evaluateExpression(expr: string, getValue: (pos: CellPosition) => any): any {
        // Handle built-in functions
        expr = this.evaluateFunctions(expr, getValue);

        // Replace cell references with their values
        expr = expr.replace(/[A-Z]+[0-9]+/g, (match) => {
            const pos = parseCellRef(match);
            if (!pos) return match;
            const value = getValue(pos);
            return String(value ?? 0);
        });

        // Evaluate the expression using a simple recursive descent parser
        return this.parseExpression(expr);
    }

    /**
     * Evaluate built-in functions like SUM, AVERAGE, etc.
     */
    private evaluateFunctions(expr: string, getValue: (pos: CellPosition) => any): string {
        // Match function calls like SUM(A1:B10) or AVERAGE(A1,B2,C3)
        const funcRegex = /(SUM|AVERAGE|COUNT|MIN|MAX)\(([^)]+)\)/g;

        return expr.replace(funcRegex, (match, funcName, args) => {
            const values = this.extractFunctionArgs(args, getValue);
            const result = this.executeFunction(funcName, values);
            return String(result);
        });
    }

    /**
     * Extract and evaluate function arguments
     */
    private extractFunctionArgs(argsStr: string, getValue: (pos: CellPosition) => any): number[] {
        const values: number[] = [];
        const args = argsStr.split(',');

        for (const arg of args) {
            const trimmed = arg.trim();

            // Check if it's a range
            if (trimmed.includes(':')) {
                const range = parseRange(trimmed);
                if (range) {
                    // Get all values in the range
                    for (let row = range.start.row; row <= range.end.row; row++) {
                        for (let col = range.start.col; col <= range.end.col; col++) {
                            const val = getValue({ row, col });
                            const num = Number(val);
                            if (!isNaN(num)) values.push(num);
                        }
                    }
                }
            } else {
                // Single cell reference or number
                const cellPos = parseCellRef(trimmed);
                if (cellPos) {
                    const val = getValue(cellPos);
                    const num = Number(val);
                    if (!isNaN(num)) values.push(num);
                } else {
                    // Try to parse as number
                    const num = Number(trimmed);
                    if (!isNaN(num)) values.push(num);
                }
            }
        }

        return values;
    }

    /**
     * Execute a built-in function
     */
    private executeFunction(name: string, values: number[]): number {
        if (values.length === 0) return 0;

        switch (name) {
            case 'SUM':
                return values.reduce((a, b) => a + b, 0);
            case 'AVERAGE':
                return values.reduce((a, b) => a + b, 0) / values.length;
            case 'COUNT':
                return values.length;
            case 'MIN':
                return Math.min(...values);
            case 'MAX':
                return Math.max(...values);
            default:
                return 0;
        }
    }

    /**
     * Simple expression parser with proper operator precedence
     */
    private parseExpression(expr: string): number {
        // Remove spaces
        expr = expr.replace(/\s/g, '');

        // Parse addition and subtraction (lowest precedence)
        let pos = expr.length - 1;
        let parenDepth = 0;

        while (pos >= 0) {
            const char = expr[pos];
            if (char === ')') parenDepth++;
            if (char === '(') parenDepth--;

            if (parenDepth === 0 && (char === '+' || char === '-')) {
                const left = this.parseExpression(expr.substring(0, pos));
                const right = this.parseExpression(expr.substring(pos + 1));
                return char === '+' ? left + right : left - right;
            }
            pos--;
        }

        // Parse multiplication and division (higher precedence)
        pos = expr.length - 1;
        parenDepth = 0;

        while (pos >= 0) {
            const char = expr[pos];
            if (char === ')') parenDepth++;
            if (char === '(') parenDepth--;

            if (parenDepth === 0 && (char === '*' || char === '/')) {
                const left = this.parseExpression(expr.substring(0, pos));
                const right = this.parseExpression(expr.substring(pos + 1));
                if (char === '/' && right === 0) throw new Error('#DIV/0!');
                return char === '*' ? left * right : left / right;
            }
            pos--;
        }

        // Handle parentheses
        if (expr.startsWith('(') && expr.endsWith(')')) {
            return this.parseExpression(expr.substring(1, expr.length - 1));
        }

        // Parse as number
        const num = Number(expr);
        if (isNaN(num)) throw new Error('#VALUE!');
        return num;
    }
}

