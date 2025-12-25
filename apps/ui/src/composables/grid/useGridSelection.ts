import { ref, watch } from 'vue';
import { toast } from '@/composables/useNotifications';
import { colIndexToLabel } from '../../components/TableView/Engine/FormulaParser';
import type { Engine } from '../../components/TableView/Engine/Engine';
import type { CellPosition } from '../../components/TableView/Engine/types';

export function useGridSelection(
    engine: Engine,
    gridContainer: any,
    rowCount: number,
    colCount: number,
    renderKey: any
) {
    // Config
    // const rowCount = 1000; // Passed in
    // const colCount = 26; // Passed in

    // State
    const selection = ref<CellPosition | null>(engine.viewState.selection);
    const rangeSelection = ref<{ start: CellPosition, end: CellPosition } | null>(null);

    // Column/Row selection state
    const selectedColumn = ref<number | null>(null);
    const selectedRow = ref<number | null>(null);
    const lastSelectedColumn = ref<number | null>(null);
    const lastSelectedRow = ref<number | null>(null);

    // Helper
    const focusGrid = () => {
        gridContainer.value?.focus();
    };

    // Logic
    const selectColumn = (col: number, e?: MouseEvent) => {
        if (e?.shiftKey && lastSelectedColumn.value !== null) {
            // Range selection
            const start = Math.min(lastSelectedColumn.value, col);
            const end = Math.max(lastSelectedColumn.value, col);

            rangeSelection.value = {
                start: { row: 0, col: start },
                end: { row: rowCount - 1, col: end }
            };
            // Keep selectedColumn as the anchor? Or null?
            selectedColumn.value = col;
        } else {
            lastSelectedColumn.value = col;
            selectedColumn.value = col;
            rangeSelection.value = {
                start: { row: 0, col },
                end: { row: rowCount - 1, col }
            };
        }

        selectedRow.value = null;
        selection.value = { row: 0, col };
        focusGrid();
    };

    const selectRow = (row: number, e?: MouseEvent) => {
        if (e?.shiftKey && lastSelectedRow.value !== null) {
            const start = Math.min(lastSelectedRow.value, row);
            const end = Math.max(lastSelectedRow.value, row);

            rangeSelection.value = {
                start: { row: start, col: 0 },
                end: { row: end, col: colCount - 1 }
            };
            selectedRow.value = row;
        } else {
            lastSelectedRow.value = row;
            selectedRow.value = row;
            rangeSelection.value = {
                start: { row, col: 0 },
                end: { row, col: colCount - 1 }
            };
        }

        selectedColumn.value = null;
        selection.value = { row, col: 0 };
        focusGrid();
    };

    const clearColumnRowSelection = () => {
        selectedColumn.value = null;
        selectedRow.value = null;
        lastSelectedColumn.value = null;
        lastSelectedRow.value = null;
    };

    const deleteSelectedColumn = async () => {
        if (selectedColumn.value === null) {
            return;
        }

        // Use Engine's deleteColumn method which tracks deletion for database
        await engine.deleteColumn(selectedColumn.value);

        toast.success(`Deleted column ${colIndexToLabel(selectedColumn.value)}`);
        selectedColumn.value = null; // Clear selection
        renderKey.value++;
    };

    const deleteSelectedRow = () => {
        if (selectedRow.value === null) return;

        // Use Engine's deleteRow method which tracks deletion for database
        engine.deleteRow(selectedRow.value);

        toast.success(`Deleted row ${selectedRow.value + 1}`);
        selectedRow.value = null; // Clear selection
        renderKey.value++;
    };

    const fillSelectedColumn = (value: string) => {
        if (selectedColumn.value === null) return;

        // Fill all cells in the column with the value
        for (let row = 0; row < rowCount; row++) {
            engine.setValue({ row, col: selectedColumn.value }, value);
        }

        toast.success(`Filled column ${colIndexToLabel(selectedColumn.value)}`);
        renderKey.value++;
    };

    const fillSelectedRow = (value: string) => {
        if (selectedRow.value === null) return;

        // Fill all cells in the row with the value
        for (let col = 0; col < colCount; col++) {
            engine.setValue({ row: selectedRow.value, col }, value);
        }

        toast.success(`Filled row ${selectedRow.value + 1}`);
        renderKey.value++;
    };

    const isColumnSelected = (col: number) => {
        return selectedColumn.value === col;
    };

    const isRowSelected = (row: number) => {
        return selectedRow.value === row;
    };

    return {
        selection,
        rangeSelection,
        selectedColumn,
        selectedRow,
        lastSelectedColumn,
        lastSelectedRow,

        selectColumn,
        selectRow,
        clearColumnRowSelection,
        deleteSelectedColumn,
        deleteSelectedRow,
        fillSelectedColumn,
        fillSelectedRow,
        isColumnSelected,
        isRowSelected,
        focusGrid
    };
}
