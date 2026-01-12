
export type CellId = string; // e.g., "A1", "B2"
export type SheetId = string;

export enum CellType {
    TEXT = 'text',
    NUMBER = 'number',
    FORMULA = 'formula',
    ERROR = 'error',
}

export interface CellPosition {
    row: number;
    col: number;
    sheetId?: SheetId; // Optional for multi-sheet support later
}

// Smart Note Types
export type NoteEntityType = 'cell' | 'row' | 'table';

export interface Note {
    id: string; // UUID
    entityType: NoteEntityType;
    entityId: string; // "row,col" for cell, "rowId" for row, "table" for table
    content: string; // Markdown supported
    author: string; // "You" or User ID
    timestamp: number;
    resolved: boolean;
    replies?: Note[]; // Threaded replies
}

export interface UserPresence {
    userId: string;
    userName: string;
    color: string;
    cursor: CellPosition;
    lastActive: number;
}

// Basic styling properties
export interface CellStyle {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: 'left' | 'center' | 'right';
    color?: string;
    background?: string;
}

// Represent the raw data stored in a cell
export interface CellData {
    rawInput: string; // What the user typed (e.g., "=A1+1")
    value: any;  // The evaluated result (e.g., 10, "Hello")
    type: CellType;
    format?: string; // e.g., "currency", "percentage"
    error?: string; // If evaluation failed
    style?: CellStyle;
}

// Interface for anything that can provide data to the grid
export interface DataSource {
    getValue(pos: CellPosition): Promise<CellData | null>;
    setValue(pos: CellPosition, value: string): Promise<void>;
    getMetadata(): Promise<any>;
    // For notifying the engine of external changes
    subscribe(callback: (changes: CellPosition[]) => void): () => void;
}

// The core configuration for the engine
export interface EngineConfig {
    rowCount: number;
    colCount: number;
    dataSource?: DataSource; // Optional external source
}

// Helpers
export const posToKey = (pos: CellPosition): string => `${pos.row},${pos.col}`;
export const keyToPos = (key: string): CellPosition => {
    const [rowStr, colStr] = key.split(',');
    return { row: Number(rowStr) || 0, col: Number(colStr) || 0 };
};

/**
 * Engine interface for type-safe UndoManager integration
 * This allows UndoManager to work with Engine without circular dependencies
 */
export interface IEngine {
    cells: Map<string, CellData>;
    columnNames: string[];
    setValue(pos: CellPosition, value: string, silent?: boolean): Promise<void>;
    deleteRow(row: number): Promise<void>;
    insertRow(row: number): Promise<void>;
    deleteColumn(col: number): Promise<void>;
    insertColumn(col: number, name?: string): Promise<void>;
    notifyChange(): void;
    getCell(pos: CellPosition): CellData | null;
}

/**
 * Source metadata for persistence
 */
export interface SourceMetadata {
    table: string | null;
    connection: any;
    provider: string | null;
    columns: string[];
}

/**
 * Change Review Types
 */
export interface RowDiff {
    type: 'create' | 'update' | 'delete';
    row: number; // Grid row index
    rowId?: any; // Primary key from DB
    changes?: Record<string, { before: any, after: any }>; // Column name -> { before, after }
    data?: Record<string, any>; // Full row data for create/delete
}
