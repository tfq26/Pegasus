/**
 * AI Data Assistant
 * 
 * Provides AI-powered data manipulation capabilities for the spreadsheet editor.
 * Supports cell-level, range-level, and table-level operations with preview and undo.
 */

import type { Engine } from '../components/TableView/Engine/Engine';
import type { CellPosition } from '../components/TableView/Engine/types';

export type SelectionType = 'cell' | 'range' | 'column' | 'row' | 'table';
export type OperationType = 'format' | 'calculate' | 'clean' | 'create' | 'delete';

export interface AIContext {
    selection: {
        type: SelectionType;
        cells: CellPosition[];
        data: any[][];
        columnIndices?: number[]; // For column selections
        rowIndices?: number[]; // For row selections
    };
    table: {
        headers: string[];
        rowCount: number;
        colCount: number;
        sampleData: any[][]; // First 10 rows for context
        schemaMode: 'named-headers' | 'column-letters';
    };
    provider: string;
    tableName: string;
}

export interface AIOperation {
    id: string;
    type: OperationType;
    description: string;
    userQuery: string;
    preview: {
        before: any[][];
        after: any[][];
        affectedCells: CellPosition[];
    };
    apply: () => Promise<void>;
    undo: () => Promise<void>;
}

export interface AIOperationResult {
    success: boolean;
    operation?: AIOperation;
    error?: string;
    suggestions?: string[];
}

export class AIDataAssistant {
    private engine: Engine;
    private aiProvider: 'gemini' | 'openai';
    private apiKey: string;
    private operationHistory: AIOperation[] = [];

    constructor(engine: Engine, aiProvider: 'gemini' | 'openai' = 'gemini', apiKey: string) {
        this.engine = engine;
        this.aiProvider = aiProvider;
        this.apiKey = apiKey;
    }

    /**
     * Analyze current selection and extract context
     */
    public analyzeSelection(selection: CellPosition[]): AIContext {
        const selectionType = this.determineSelectionType(selection);
        const data = this.extractSelectionData(selection);

        // Get sample data for table context (first 10 rows)
        const sampleData: any[][] = [];
        const maxRows = Math.min(10, this.engine.config.rowCount);
        const colCount = this.engine.columnNames.length || this.engine.config.colCount;

        for (let row = 0; row < maxRows; row++) {
            const rowData: any[] = [];
            for (let col = 0; col < colCount; col++) {
                const cell = this.engine.getCell({ row, col });
                rowData.push(cell?.value ?? null);
            }
            sampleData.push(rowData);
        }

        return {
            selection: {
                type: selectionType,
                cells: selection,
                data,
                columnIndices: selectionType === 'column' ? this.getColumnIndices(selection) : undefined,
                rowIndices: selectionType === 'row' ? this.getRowIndices(selection) : undefined
            },
            table: {
                headers: this.engine.columnNames,
                rowCount: this.engine.config.rowCount,
                colCount: this.engine.columnNames.length || this.engine.config.colCount,
                sampleData,
                schemaMode: this.engine.schemaMode
            },
            provider: this.engine.sourceProvider || 'unknown',
            tableName: this.engine.sourceTable || 'untitled'
        };
    }

    /**
     * Suggest operations based on user query and context
     */
    public async suggestOperations(
        context: AIContext,
        userQuery: string
    ): Promise<AIOperationResult> {
        try {
            const prompt = this.buildOperationPrompt(context, userQuery);
            const aiResponse = await this.callAI(prompt);

            // Parse AI response to determine operation type and parameters
            const operation = await this.parseAIResponse(aiResponse, context, userQuery);

            return {
                success: true,
                operation
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                suggestions: this.getFallbackSuggestions(userQuery)
            };
        }
    }

    /**
     * Preview an operation before applying
     */
    public async previewOperation(operation: AIOperation): Promise<{
        before: any[][];
        after: any[][];
        summary: string;
    }> {
        return {
            before: operation.preview.before,
            after: operation.preview.after,
            summary: `This will affect ${operation.preview.affectedCells.length} cells`
        };
    }

    /**
     * Apply an operation to the engine
     */
    public async applyOperation(operation: AIOperation): Promise<void> {
        // Create undo snapshot
        const snapshot = this.createSnapshot(operation.preview.affectedCells);

        // Apply the operation
        await operation.apply();

        // Store in history with undo function
        operation.undo = async () => {
            await this.restoreSnapshot(snapshot);
        };

        this.operationHistory.push(operation);
    }

    /**
     * Undo the last operation
     */
    public async undoLastOperation(): Promise<void> {
        const lastOp = this.operationHistory.pop();
        if (lastOp && lastOp.undo) {
            await lastOp.undo();
        }
    }

    // ============================================================================
    // OPERATION BUILDERS
    // ============================================================================

    /**
     * Build formatting operation (uppercase, lowercase, date format, etc.)
     */
    private buildFormatOperation(
        context: AIContext,
        formatType: string,
        params: any
    ): AIOperation {
        const affectedCells = context.selection.cells;
        const before = this.extractSelectionData(affectedCells);
        const after = this.applyFormat(before, formatType, params);

        return {
            id: this.generateOperationId(),
            type: 'format',
            description: `Format as ${formatType}`,
            userQuery: '',
            preview: { before, after, affectedCells },
            apply: async () => {
                for (let i = 0; i < affectedCells.length; i++) {
                    const cell = affectedCells[i];
                    const newValue = after[Math.floor(i / context.selection.data[0].length)][i % context.selection.data[0].length];
                    await this.engine.setValue(cell, String(newValue ?? ''));
                }
            },
            undo: async () => { } // Will be set when applied
        };
    }

    /**
   * Build calculation operation (sum, average, formulas, etc.)
   */
    private buildCalculationOperation(
        context: AIContext,
        calculation: string,
        targetCells: CellPosition[]
    ): AIOperation {
        const affectedCells = targetCells;
        const before = this.extractSelectionData(affectedCells);
        const after = this.performCalculation(context, calculation);

        return {
            id: this.generateOperationId(),
            type: 'calculate',
            description: `Calculate: ${calculation}`,
            userQuery: '',
            preview: { before, after, affectedCells },
            apply: async () => {
                for (let i = 0; i < affectedCells.length; i++) {
                    const cell = affectedCells[i];
                    const newValue = after[0][i]; // Calculations typically produce single row
                    await this.engine.setValue(cell, String(newValue ?? ''));
                }
            },
            undo: async () => { }
        };
    }

    /**
     * Build data cleaning operation (remove duplicates, fill blanks, etc.)
     */
    private buildCleanOperation(
        context: AIContext,
        cleanType: string,
        params: any
    ): AIOperation {
        const affectedCells = context.selection.cells;
        const before = this.extractSelectionData(affectedCells);
        const after = this.applyClean(before, cleanType, params);

        return {
            id: this.generateOperationId(),
            type: 'clean',
            description: `Clean data: ${cleanType}`,
            userQuery: '',
            preview: { before, after, affectedCells },
            apply: async () => {
                for (let i = 0; i < affectedCells.length; i++) {
                    const cell = affectedCells[i];
                    const rowIdx = Math.floor(i / context.selection.data[0].length);
                    const colIdx = i % context.selection.data[0].length;
                    const newValue = after[rowIdx][colIdx];
                    await this.engine.setValue(cell, String(newValue ?? ''));
                }
            },
            undo: async () => { }
        };
    }

    /**
     * Build creation operation (add columns, generate data, etc.)
     */
    private buildCreateOperation(
        context: AIContext,
        createType: string,
        params: any
    ): AIOperation {
        const affectedCells: CellPosition[] = [];
        const before: any[][] = [];
        const after = this.generateCreation(context, createType, params);

        // Determine affected cells based on creation type
        if (createType === 'column') {
            const newColIndex = this.engine.columnNames.length;
            for (let row = 0; row < this.engine.config.rowCount; row++) {
                affectedCells.push({ row, col: newColIndex });
            }
        }

        return {
            id: this.generateOperationId(),
            type: 'create',
            description: `Create: ${createType}`,
            userQuery: '',
            preview: { before, after, affectedCells },
            apply: async () => {
                if (createType === 'column') {
                    await this.engine.insertColumn(this.engine.columnNames.length, params.columnName);
                }
                // Apply generated data
                for (let i = 0; i < affectedCells.length; i++) {
                    const cell = affectedCells[i];
                    const value = after[i] ? after[i][0] : '';
                    await this.engine.setValue(cell, String(value ?? ''));
                }
            },
            undo: async () => { }
        };
    }

    /**
     * Build deletion operation (remove rows/columns by criteria)
     */
    private buildDeleteOperation(
        context: AIContext,
        deleteType: string,
        params: any
    ): AIOperation {
        const affectedCells = this.identifyDeletionTargets(context, deleteType, params);
        const before = this.extractSelectionData(affectedCells);

        return {
            id: this.generateOperationId(),
            type: 'delete',
            description: `Delete: ${deleteType}`,
            userQuery: '',
            preview: { before, after: [], affectedCells },
            apply: async () => {
                if (deleteType === 'rows') {
                    const rowsToDelete = params.rows || [];
                    for (const row of rowsToDelete.sort((a: number, b: number) => b - a)) {
                        await this.engine.deleteRow(row);
                    }
                } else if (deleteType === 'columns') {
                    const colsToDelete = params.columns || [];
                    for (const col of colsToDelete.sort((a: number, b: number) => b - a)) {
                        await this.engine.deleteColumn(col);
                    }
                }
            },
            undo: async () => { }
        };
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private determineSelectionType(selection: CellPosition[]): SelectionType {
        if (selection.length === 0) return 'table';
        if (selection.length === 1) return 'cell';

        // Check if all cells are in same column
        const firstCol = selection[0].col;
        if (selection.every(cell => cell.col === firstCol)) return 'column';

        // Check if all cells are in same row
        const firstRow = selection[0].row;
        if (selection.every(cell => cell.row === firstRow)) return 'row';

        return 'range';
    }

    private extractSelectionData(selection: CellPosition[]): any[][] {
        if (selection.length === 0) return [];

        // Find bounds
        const minRow = Math.min(...selection.map(c => c.row));
        const maxRow = Math.max(...selection.map(c => c.row));
        const minCol = Math.min(...selection.map(c => c.col));
        const maxCol = Math.max(...selection.map(c => c.col));

        const data: any[][] = [];
        for (let row = minRow; row <= maxRow; row++) {
            const rowData: any[] = [];
            for (let col = minCol; col <= maxCol; col++) {
                const cell = this.engine.getCell({ row, col });
                rowData.push(cell?.value ?? null);
            }
            data.push(rowData);
        }

        return data;
    }

    private getColumnIndices(selection: CellPosition[]): number[] {
        const cols = new Set(selection.map(c => c.col));
        return Array.from(cols).sort((a, b) => a - b);
    }

    private getRowIndices(selection: CellPosition[]): number[] {
        const rows = new Set(selection.map(c => c.row));
        return Array.from(rows).sort((a, b) => a - b);
    }

    private buildOperationPrompt(context: AIContext, userQuery: string): string {
        return `You are a data manipulation assistant. Analyze this request and suggest an operation.

User Query: "${userQuery}"

Context:
- Selection Type: ${context.selection.type}
- Selected Data: ${JSON.stringify(context.selection.data).substring(0, 500)}
- Table Headers: ${context.table.headers.join(', ')}
- Schema Mode: ${context.table.schemaMode}

Available Operations:
1. FORMAT: Change text case, date/number formatting, trim/pad
2. CALCULATE: Apply formulas, statistics, conditional logic
3. CLEAN: Remove duplicates, fill blanks, normalize, validate
4. CREATE: Generate data, add columns, split/merge
5. DELETE: Remove rows/columns by criteria

Respond with a JSON object:
{
  "operation": "format|calculate|clean|create|delete",
  "action": "specific action to take",
  "parameters": { /* operation-specific params */ }
}`;
    }

    private async callAI(prompt: string): Promise<string> {
        const baseUrl = import.meta.env.VITE_QUERY_API_URL;

        const response = await fetch(`${baseUrl}/api/ai/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                query: prompt,
                provider: this.aiProvider
            })
        });

        if (!response.ok) {
            throw new Error(`AI request failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result || data.response || '';
    }

    private async parseAIResponse(
        response: string,
        context: AIContext,
        userQuery: string
    ): Promise<AIOperation> {
        try {
            const parsed = JSON.parse(response);

            switch (parsed.operation) {
                case 'format':
                    return this.buildFormatOperation(context, parsed.action, parsed.parameters);
                case 'calculate':
                    return this.buildCalculationOperation(context, parsed.action, context.selection.cells);
                default:
                    throw new Error(`Unknown operation type: ${parsed.operation}`);
            }
        } catch (e) {
            // Fallback: create a simple operation based on keywords
            return this.createFallbackOperation(context, userQuery);
        }
    }

    private createFallbackOperation(context: AIContext, userQuery: string): AIOperation {
        const query = userQuery.toLowerCase();

        if (query.includes('uppercase') || query.includes('upper')) {
            return this.buildFormatOperation(context, 'uppercase', {});
        }

        if (query.includes('lowercase') || query.includes('lower')) {
            return this.buildFormatOperation(context, 'lowercase', {});
        }

        throw new Error('Could not determine operation from query');
    }

    private applyFormat(data: any[][], formatType: string, params: any): any[][] {
        return data.map(row =>
            row.map(cell => {
                if (cell === null || cell === undefined) return cell;
                const str = String(cell);

                switch (formatType) {
                    case 'uppercase':
                        return str.toUpperCase();
                    case 'lowercase':
                        return str.toLowerCase();
                    case 'titlecase':
                        return str.replace(/\w\S*/g, txt =>
                            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                        );
                    case 'trim':
                        return str.trim();
                    default:
                        return cell;
                }
            })
        );
    }

    private performCalculation(context: AIContext, calculation: string): any[][] {
        // Placeholder - will be enhanced with actual calculation logic
        return [[0]];
    }

    private createSnapshot(cells: CellPosition[]): Map<string, any> {
        const snapshot = new Map();
        cells.forEach(cell => {
            const key = `${cell.row},${cell.col}`;
            const cellData = this.engine.getCell(cell);
            snapshot.set(key, cellData?.rawInput || '');
        });
        return snapshot;
    }

    private async restoreSnapshot(snapshot: Map<string, any>): Promise<void> {
        for (const [key, value] of snapshot.entries()) {
            const [row, col] = key.split(',').map(Number);
            await this.engine.setValue({ row, col }, value);
        }
    }

    private getFallbackSuggestions(query: string): string[] {
        return [
            'Try: "convert to uppercase"',
            'Try: "calculate sum of column A"',
            'Try: "remove duplicates"',
            'Try: "fill blank cells"'
        ];
    }

    private generateOperationId(): string {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Apply data cleaning operations
     */
    private applyClean(data: any[][], cleanType: string, params: any): any[][] {
        switch (cleanType) {
            case 'remove_duplicates':
                return this.removeDuplicates(data);
            case 'fill_blanks':
                return this.fillBlanks(data, params.fillValue || '');
            case 'trim':
                return data.map(row => row.map(cell =>
                    typeof cell === 'string' ? cell.trim() : cell
                ));
            default:
                return data;
        }
    }

    /**
     * Generate new data for creation operations
     */
    private generateCreation(context: AIContext, createType: string, params: any): any[][] {
        if (createType === 'column') {
            // Generate empty column data
            const rows: any[][] = [];
            for (let i = 0; i < context.table.rowCount; i++) {
                rows.push([params.defaultValue || '']);
            }
            return rows;
        }
        return [];
    }

    /**
     * Identify cells to be deleted based on criteria
     */
    private identifyDeletionTargets(context: AIContext, deleteType: string, params: any): CellPosition[] {
        const cells: CellPosition[] = [];

        if (deleteType === 'rows') {
            const rowsToDelete = params.rows || [];
            for (const row of rowsToDelete) {
                for (let col = 0; col < context.table.colCount; col++) {
                    cells.push({ row, col });
                }
            }
        } else if (deleteType === 'columns') {
            const colsToDelete = params.columns || [];
            for (const col of colsToDelete) {
                for (let row = 0; row < context.table.rowCount; row++) {
                    cells.push({ row, col });
                }
            }
        }

        return cells;
    }

    /**
     * Remove duplicate rows from data
     */
    private removeDuplicates(data: any[][]): any[][] {
        const seen = new Set<string>();
        return data.filter(row => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Fill blank cells with a value
     */
    private fillBlanks(data: any[][], fillValue: any): any[][] {
        return data.map(row =>
            row.map(cell => (cell === null || cell === undefined || cell === '') ? fillValue : cell)
        );
    }
}
