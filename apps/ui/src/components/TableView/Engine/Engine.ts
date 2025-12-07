
import type { CellPosition, CellData, EngineConfig } from './types';
import { CellType, posToKey } from './types';
import { DependencyGraph } from './DependencyGraph';
import { FormulaParser } from './FormulaParser';

export class Engine {
    private cells: Map<string, CellData> = new Map();
    private graph: DependencyGraph;
    public parser: FormulaParser;
    public config: EngineConfig;
    private changeCallbacks: Set<() => void> = new Set();
    private storageKey: string;
    private isBatching = false;

    // Database persistence tracking
    public sourceTable: string | null = null;
    public sourceConnection: any | null = null; // Full connection config
    public sourceProvider: string | null = null;
    public columnNames: string[] = [];
    private originalData: Map<string, CellData> = new Map(); // Snapshot of loaded data
    private modifiedCells: Set<string> = new Set(); // Track which cells changed
    public saveStatus: 'saved' | 'saving' | 'error' = 'saved';


    // Transient view state (preserved in memory for tab switching)
    public viewState = {
        scrollTop: 0,
        selection: null as CellPosition | null,
    };

    constructor(config: EngineConfig, storageKey = 'spreadsheet-data') {
        this.config = config;
        this.graph = new DependencyGraph();
        this.parser = new FormulaParser();
        this.storageKey = storageKey;
        this.loadFromStorage();
    }

    /**
     * Set the source table for database persistence
     */
    public setSource(tableName: string, connection: any, columns: string[], provider?: string) {
        this.sourceTable = tableName;
        this.sourceConnection = connection;
        this.sourceProvider = provider || 'sqlite'; // Default if missing
        this.columnNames = columns;
        // Take snapshot of current data as "original"
        this.originalData = new Map(this.cells);
        this.modifiedCells.clear();
    }

    /**
     * Get all modified rows for saving to database
     */
    public getModifiedRows(): Map<number, Record<string, any>> {
        const modifiedRows = new Map<number, Record<string, any>>();

        for (const cellKey of this.modifiedCells) {
            const parts = cellKey.split(',');
            const rowStr = parts[0];
            if (!rowStr) continue;

            const row = parseInt(rowStr);

            if (!modifiedRows.has(row)) {
                // Build the entire row data
                const rowData: Record<string, any> = {};
                for (let col = 0; col < this.columnNames.length; col++) {
                    const colName = this.columnNames[col];
                    if (!colName) continue;

                    const cell = this.getCell({ row, col });
                    rowData[colName] = cell?.value ?? null;
                }
                modifiedRows.set(row, rowData);
            }
        }

        return modifiedRows;
    }

    /**
     * Clear modified tracking after successful save
     */
    public clearModifiedTracking() {
        this.modifiedCells.clear();
        this.originalData = new Map(this.cells);
    }


    /**
     * Begin batch mode - notifications will be deferred until endBatch()
     */
    public beginBatch() {
        this.isBatching = true;
    }

    /**
     * End batch mode - trigger a single notification
     */
    public endBatch() {
        this.isBatching = false;
        this.notifyChange();
    }

    /**
     * Register a callback to be called when cells change
     */
    public onChange(callback: () => void) {
        this.changeCallbacks.add(callback);
        return () => this.changeCallbacks.delete(callback);
    }

    private notifyChange() {
        if (this.isBatching) return; // Skip if batching
        this.changeCallbacks.forEach(cb => cb());
        this.saveToStorage();
    }

    private saveToStorage() {
        try {
            const data = Array.from(this.cells.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }

    private loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored) as [string, CellData][];
                this.cells = new Map(data);
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
    }

    /**
     * Sets a value in the grid and triggers recalculation.
     */
    public async setValue(pos: CellPosition, input: string) {
        const key = posToKey(pos);

        // 1. Clear old dependencies
        this.graph.clearDependencies(pos);

        // 2. Parse Input
        let cellData: CellData = {
            rawInput: input,
            value: input,
            type: CellType.TEXT,
        };

        if (input.startsWith('=')) {
            cellData.type = CellType.FORMULA;
            const parsed = this.parser.parse(input);

            // Register new dependencies
            parsed.references.forEach(dep => {
                this.graph.addDependency(pos, dep);
            });

            // Evaluate immediately (first pass)
            cellData.value = this.evaluateParsed(parsed);
        } else if (!isNaN(Number(input)) && input.trim() !== '') {
            cellData.type = CellType.NUMBER;
            cellData.value = Number(input);
        }

        // 3. Store
        this.cells.set(key, cellData);
        this.modifiedCells.add(key);

        // 4. Recalculate Dependents
        const dependents = this.graph.getDependents(pos);
        for (const dep of dependents) {
            await this.recalculate(dep);
        }

        // 5. Notify change
        this.notifyChange();
    }

    public getCell(pos: CellPosition): CellData | null {
        return this.cells.get(posToKey(pos)) || null;
    }

    public getDisplayValue(pos: CellPosition): string {
        const cell = this.getCell(pos);
        if (!cell) return '';
        return String(cell.value);
    }

    public getRowData(row: number): any[] {
        const rowData: any[] = [];
        const cols = this.config.colCount || 26;
        for (let c = 0; c < cols; c++) {
            rowData.push(this.getDisplayValue({ row, col: c }));
        }
        return rowData;
    }

    private async recalculate(pos: CellPosition) {
        const key = posToKey(pos);
        const cell = this.cells.get(key);
        if (!cell || cell.type !== CellType.FORMULA) return;

        const parsed = this.parser.parse(cell.rawInput);
        cell.value = this.evaluateParsed(parsed);
        this.cells.set(key, { ...cell });
        this.modifiedCells.add(key);
    }


    private evaluateParsed(parsed: any): any {
        return parsed.evaluate((ref: CellPosition) => {
            const c = this.getCell(ref);
            return c ? (isNaN(Number(c.value)) ? 0 : Number(c.value)) : 0;
        });
    }

    public clear() {
        this.cells.clear();
        this.notifyChange();
    }
}
