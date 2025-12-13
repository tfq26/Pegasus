import type { CellPosition } from './types';

/**
 * Command interface for undo/redo operations
 */
export interface Command {
    execute(): Promise<void> | void;
    undo(): Promise<void> | void;
    description: string;
}

/**
 * Set value command - handles cell edits
 */
export class SetValueCommand implements Command {
    private position: CellPosition;
    private newValue: string;
    private oldValue: string;
    private engine: any;

    constructor(engine: any, position: CellPosition, newValue: string, oldValue: string) {
        this.engine = engine;
        this.position = position;
        this.newValue = newValue;
        this.oldValue = oldValue;
    }

    execute(): void {
        this.engine.setValue(this.position, this.newValue, true);
    }

    undo(): void {
        this.engine.setValue(this.position, this.oldValue, true);
    }

    get description(): string {
        return `Edit cell (${this.position.row}, ${this.position.col})`;
    }
}

/**
 * Delete row command
 */
export class DeleteRowCommand implements Command {
    private row: number;
    private rowData: Map<string, any>;
    private engine: any;

    constructor(engine: any, row: number) {
        this.engine = engine;
        this.row = row;
        this.rowData = new Map();

        // Store row data before deletion
        const cols = this.engine.columnNames.length;
        for (let col = 0; col < cols; col++) {
            const key = `${row},${col}`;
            const cell = this.engine.cells.get(key);
            if (cell) {
                this.rowData.set(key, { ...cell });
            }
        }
    }

    async execute(): Promise<void> {
        this.engine.isUndoRedoOperation = true;
        await this.engine.deleteRow(this.row);
        this.engine.isUndoRedoOperation = false;
    }

    undo(): void {
        // 1. Insert the row back (shifts others down)
        this.engine.insertRow(this.row);

        // 2. Restore row data
        for (const [key, cell] of this.rowData) {
            this.engine.cells.set(key, cell);
        }
        this.engine.notifyChange();
    }

    get description(): string {
        return `Delete row ${this.row + 1}`;
    }
}

/**
 * Delete column command
 */
export class DeleteColumnCommand implements Command {
    private col: number;
    private columnName: string;
    private columnData: Map<string, any>;
    private engine: any;

    constructor(engine: any, col: number) {
        this.engine = engine;
        this.col = col;
        this.columnName = this.engine.columnNames[col];
        this.columnData = new Map();

        // Store column data before deletion
        // We only check defined rows to save memory, roughly
        for (const [key, cell] of this.engine.cells) {
            const [r, c] = key.split(',').map(Number);
            if (c === col) {
                this.columnData.set(key, { ...cell });
            }
        }
    }

    async execute(): Promise<void> {
        this.engine.isUndoRedoOperation = true;
        await this.engine.deleteColumn(this.col);
        this.engine.isUndoRedoOperation = false;
    }

    undo(): void {
        // 1. Insert column back
        this.engine.insertColumn(this.col, this.columnName);

        // 2. Restore column data
        for (const [key, cell] of this.columnData) {
            this.engine.cells.set(key, cell);
        }

        this.engine.notifyChange();
    }

    get description(): string {
        return `Delete column ${this.columnName}`;
    }
}

/**
 * Insert row command
 */
export class InsertRowCommand implements Command {
    private row: number;
    private engine: any;

    constructor(engine: any, row: number) {
        this.engine = engine;
        this.row = row;
    }

    async execute(): Promise<void> {
        this.engine.isUndoRedoOperation = true;
        await this.engine.insertRow(this.row);
        this.engine.isUndoRedoOperation = false;
    }

    undo(): void {
        this.engine.deleteRow(this.row);
    }

    get description(): string {
        return `Insert row at ${this.row + 1}`;
    }
}

/**
 * Insert column command
 */
export class InsertColumnCommand implements Command {
    private col: number;
    private columnName: string;
    private engine: any;

    constructor(engine: any, col: number, columnName: string) {
        this.engine = engine;
        this.col = col;
        this.columnName = columnName;
    }

    async execute(): Promise<void> {
        this.engine.isUndoRedoOperation = true;
        await this.engine.insertColumn(this.col, this.columnName);
        this.engine.isUndoRedoOperation = false;
    }

    undo(): void {
        this.engine.deleteColumn(this.col);
    }

    get description(): string {
        return `Insert column ${this.columnName}`;
    }
}

/**
 * Undo/Redo manager
 */
export class UndoManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private maxHistorySize: number;

    constructor(maxHistorySize = 100) {
        this.maxHistorySize = maxHistorySize;
    }

    /**
     * Execute a command and add to undo stack
     */
    async execute(command: Command): Promise<void> {
        await command.execute();

        // Add to undo stack
        this.undoStack.push(command);

        // Clear redo stack (new action invalidates redo history)
        this.redoStack = [];

        // Enforce max history size
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo the last command
     */
    undo(): boolean {
        const command = this.undoStack.pop();
        if (!command) return false;

        command.undo();
        this.redoStack.push(command);

        return true;
    }

    /**
     * Redo the last undone command
     */
    redo(): boolean {
        const command = this.redoStack.pop();
        if (!command) return false;

        command.execute();
        this.undoStack.push(command);

        return true;
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * Get description of next undo operation
     */
    getUndoDescription(): string | null {
        const command = this.undoStack[this.undoStack.length - 1];
        return command ? command.description : null;
    }

    /**
     * Get description of next redo operation
     */
    getRedoDescription(): string | null {
        const command = this.redoStack[this.redoStack.length - 1];
        return command ? command.description : null;
    }

    /**
     * Clear all history
     */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
    }
}
