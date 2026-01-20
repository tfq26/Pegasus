import { ref, computed, nextTick, type Ref } from 'vue';
import type { Engine } from '../../components/TableView/Engine/Engine';
import type { CellPosition } from '../../components/TableView/Engine/types';

export function useGridEditing(
    engine: Engine,
    gridContainer: Ref<HTMLElement | null>,
    selection: Ref<CellPosition | null>,
    canvasEditInputRef?: Ref<HTMLInputElement | null>
) {
    const editingCell = ref<CellPosition | null>(null);
    const formulaBarValue = ref('');
    const originalCellValue = ref(''); // Track original value when editing starts

    const currentCellRawValue = computed(() => {
        if (!selection.value) return '';
        const cell = engine.getCell(selection.value);
        return cell?.rawInput || '';
    });

    const commitEdit = () => {
        if (!editingCell.value) return;

        const cellPos = editingCell.value;
        const newValue = formulaBarValue.value;
        const oldValue = originalCellValue.value;

        // Save if value changed
        if (newValue !== oldValue) {
            engine.setValue(cellPos, newValue, false);
        }

        editingCell.value = null;
        originalCellValue.value = '';
    };

    const startEditing = async (row: number, col: number, initialValue?: string) => {
        // First, commit any pending edit
        if (editingCell.value) {
            commitEdit();
        }

        selection.value = { row, col };
        editingCell.value = { row, col };

        // Get the current cell value BEFORE setting formulaBarValue
        const cellValue = engine.getCell({ row, col })?.rawInput || '';
        originalCellValue.value = cellValue;

        // Use initial value if provided (for typing), otherwise use current cell value
        if (initialValue !== undefined) {
            formulaBarValue.value = initialValue;
        } else {
            formulaBarValue.value = cellValue;
        }

        // Wait for the input to be rendered in the DOM
        // Two nextTicks: one for Vue to update computed props, one for render
        await nextTick();
        await nextTick();

        // Try to find and focus the input
        // First, try DOM table-based input (for non-canvas mode)
        const td = gridContainer.value?.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        const domInput = td?.querySelector('input') as HTMLInputElement;

        // If DOM input found (fallback table mode), focus it
        if (domInput) {
            domInput.focus();
            if (initialValue !== undefined) {
                domInput.setSelectionRange(initialValue.length, initialValue.length);
            } else {
                domInput.select();
            }
        }
        // Otherwise, try the canvas overlay input (canvas mode)
        else if (canvasEditInputRef?.value) {
            canvasEditInputRef.value.focus();
            if (initialValue !== undefined) {
                canvasEditInputRef.value.setSelectionRange(initialValue.length, initialValue.length);
            } else {
                canvasEditInputRef.value.select();
            }
        }
    };

    const onCellInputChange = (e: Event) => {
        formulaBarValue.value = (e.target as HTMLInputElement).value;
    };

    const onCellBlur = () => {
        // Commit the edit when input loses focus
        commitEdit();
    };

    const cancelEdit = () => {
        editingCell.value = null;
        originalCellValue.value = '';
        formulaBarValue.value = currentCellRawValue.value;
    };

    return {
        editingCell,
        formulaBarValue,
        currentCellRawValue,
        startEditing,
        commitEdit,
        cancelEdit,
        onCellInputChange,
        onCellBlur
    };
}
