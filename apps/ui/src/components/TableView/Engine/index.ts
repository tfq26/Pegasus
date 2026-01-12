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

// === High-Performance Engine (Phase 1) ===
// Columnar data storage with TypedArrays
export { ColumnStore, type ColumnSchema, type ColumnData, type ColumnStoreConfig } from './ColumnStore';

// Sparse edit tracking
export { EditOverlay, type EditRecord, type RowChange } from './EditOverlay';

// Virtualized data loading
export {
    VirtualDataProvider,
    createDefaultFetcher,
    type DataFetcher,
    type Viewport,
    type VirtualDataProviderConfig,
    type VirtualDataProviderEvents
} from './VirtualDataProvider';

// LRU Cache for chunk management
export { LRUCache } from './LRUCache';
