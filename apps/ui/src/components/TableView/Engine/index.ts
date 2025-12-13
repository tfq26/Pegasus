/**
 * Engine Module Exports
 * 
 * This file re-exports all Engine-related modules for cleaner imports.
 */

// Core Engine
export { Engine } from './Engine';

// Types
export type {
    CellPosition,
    CellData,
    CellStyle,
    EngineConfig,
    DataSource,
    IEngine,
    SourceMetadata
} from './types';
export { CellType, posToKey, keyToPos } from './types';

// Supporting modules
export { ChangeTracker, type Operation, type IEngineReadable } from './ChangeTracker';
export { StorageManager } from './StorageManager';
export { DataLoader, type TableData, type ProgressCallback, type IEngineWritable } from './DataLoader';
export { MemoryManager, type ProviderCapabilities, type MemoryUsage } from './MemoryManager';

// Formula parsing
export { FormulaParser, colIndexToLabel, colLabelToIndex } from './FormulaParser';
export { DependencyGraph } from './DependencyGraph';

// Undo/Redo
export { UndoManager } from './UndoManager';

// Export
export { CSVExporter, ExcelExporter } from './Exporters';

// Search
export { SearchEngine } from './SearchEngine';
