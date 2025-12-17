import { ref, computed, nextTick, type Ref } from 'vue';
import type { Engine } from '../../components/TableView/Engine/Engine';
import type { CellPosition } from '../../components/TableView/Engine/types';

export function useGridEditing(
    engine: Engine,
    gridContainer: Ref<HTMLElement | null>,
    selection: Ref<CellPosition | null>
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

        // Save the value silently (don't trigger auto-save yet)
        if (formulaBarValue.value !== currentCellRawValue.value && editingCell.value) {
            await engine.setValue(editingCell.value, formulaBarValue.value, true); // silent = true
        }

        editingCell.value = null;

        // Now trigger onChange to save
        engine.notifyChange();
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

        // Scoped query selector
        const td = gridContainer.value?.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        const input = td?.querySelector('input') as HTMLInputElement;
        if (input) {
            input.focus();
            // If we have an initial value, put cursor at end
            if (initialValue !== undefined) {
                input.setSelectionRange(initialValue.length, initialValue.length);
            } else {
                input.select();
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

    // Helper to sync formula bar with selection when NOT editing
    // Grid.vue normally watches selection to update formulaBarValue if not editing
    // But here we expose formulaBarValue

    return {
        editingCell,
        formulaBarValue,
        currentCellRawValue,
        startEditing,
        commitEdit,
        onCellInputChange,
        onCellBlur
    };
}
