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

    const currentCellRawValue = computed(() => {
        if (!selection.value) return '';
        const cell = engine.getCell(selection.value);
        return cell?.rawInput || '';
    });

    const commitEdit = async () => {
        if (!editingCell.value) return;

        // Only save if value actually changed
        if (formulaBarValue.value !== currentCellRawValue.value && editingCell.value) {
            // Save with silent=false to trigger proper change tracking
            // This is the moment we want to track changes - when user commits the edit
            await engine.setValue(editingCell.value, formulaBarValue.value, false);
        }

        editingCell.value = null;
    };

    const startEditing = async (row: number, col: number, initialValue?: string) => {
        // First, commit any pending edit
        if (editingCell.value) {
            await commitEdit();
        }

        selection.value = { row, col };
        editingCell.value = { row, col };

        // Use initial value if provided (for typing), otherwise use current cell value
        if (initialValue !== undefined) {
            formulaBarValue.value = initialValue;
        } else {
            formulaBarValue.value = currentCellRawValue.value;
        }

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

    const onCellBlur = async () => {
        // Commit the edit when input loses focus
        // Small delay to allow other events (like clicking another cell) to fire first handled by startEditing
        // But basic blur should commit
        await commitEdit();
    };

    const cancelEdit = () => {
        editingCell.value = null;
        formulaBarValue.value = currentCellRawValue.value;
    };

    // Helper to sync formula bar with selection when NOT editing
    // Grid.vue normally watches selection to update formulaBarValue if not editing
    // But here we expose formulaBarValue

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
