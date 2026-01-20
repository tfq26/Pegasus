import { ref, computed, reactive } from 'vue';
import type { Engine } from '../../../Engine/Engine';

export function useGridScroll(engine: Engine) {
    // Configuration
    const rowCount = 1000;
    const colCount = 26; // Reduced to 26 (A-Z) for better horizontal fit
    const rowHeight = 24;
    const defaultColWidth = 100;

    // Dynamic column widths (reactive map)
    const columnWidths = reactive<Record<number, number>>({});

    // Text wrapping toggle
    const textWrap = ref(false);

    // Get width for a specific column
    const getColWidth = (col: number): number => {
        return columnWidths[col] ?? defaultColWidth;
    };

    // Set width for a specific column
    const setColWidth = (col: number, width: number) => {
        columnWidths[col] = Math.max(40, Math.min(500, width)); // Clamp between 40-500px
    };

    // Auto-fit column width based on content
    const autoFitColumn = (col: number) => {
        const minWidth = 60;
        const maxWidth = 400;
        const charWidth = 8;
        let maxLen = 3; // Minimum for column label like "A"

        // Sample first 50 rows for content width
        for (let row = 0; row < Math.min(50, rowCount); row++) {
            const cell = engine.getCell({ row, col });
            if (cell?.rawInput) {
                const len = String(cell.rawInput).length;
                if (len > maxLen) maxLen = len;
            }
        }

        const calculatedWidth = Math.min(maxWidth, Math.max(minWidth, maxLen * charWidth + 24));
        setColWidth(col, calculatedWidth);
    };

    // Auto-fit all columns
    const autoFitAllColumns = () => {
        for (let col = 0; col < colCount; col++) {
            autoFitColumn(col);
        }
    };

    // Calculate total width of all columns
    const totalWidth = computed(() => {
        let total = 40; // Row header width
        for (let col = 0; col < colCount; col++) {
            total += getColWidth(col);
        }
        return total;
    });

    // Calculate left offset for a column
    const getColLeftOffset = (targetCol: number): number => {
        let offset = 40; // Start after row header
        for (let col = 0; col < targetCol; col++) {
            offset += getColWidth(col);
        }
        return offset;
    };

    // Refs
    const gridContainer = ref<HTMLElement | null>(null);
    const headerContainer = ref<HTMLElement | null>(null);

    // Virtualization State
    const virtualState = ref({
        startRow: 0,
        visibleRowCount: 40 // Initial buffer
    });

    const onScroll = (e: Event) => {
        const target = e.target as HTMLElement;
        const scrollTop = target.scrollTop;

        // Update engine view state
        engine.viewState.scrollTop = scrollTop;

        // Sync horizontal scroll (header container is now inside grid, but keep for compatibility)
        if (headerContainer.value) {
            headerContainer.value.scrollLeft = target.scrollLeft;
        }

        // Calculate start row based on scroll position
        const startRow = Math.floor(scrollTop / rowHeight);

        // Update state if changed
        if (startRow !== virtualState.value.startRow) {
            virtualState.value.startRow = startRow;
        }
    };

    const visibleRows = computed(() => {
        return Array.from({ length: virtualState.value.visibleRowCount }, (_, i) => i); // 0 to visibleRowCount-1
    });

    const scrollToCell = (row: number, col: number) => {
        if (!gridContainer.value) return;

        // Vertical
        const top = row * rowHeight;
        const bottom = (row + 1) * rowHeight;
        const containerHeight = gridContainer.value.clientHeight;
        const scrollTop = gridContainer.value.scrollTop;

        if (top < scrollTop) {
            gridContainer.value.scrollTop = top;
        } else if (bottom > scrollTop + containerHeight) {
            gridContainer.value.scrollTop = bottom - containerHeight;
        }

        // Horizontal - use dynamic column widths
        const left = getColLeftOffset(col);
        const right = left + getColWidth(col);
        const containerWidth = gridContainer.value.clientWidth;
        const scrollLeft = gridContainer.value.scrollLeft;

        if (left < scrollLeft) {
            gridContainer.value.scrollLeft = left;
        } else if (right > scrollLeft + containerWidth) {
            gridContainer.value.scrollLeft = right - containerWidth;
        }
    };

    return {
        // Config
        rowCount,
        colCount,
        rowHeight,
        defaultColWidth,

        // Dynamic sizing
        columnWidths,
        getColWidth,
        setColWidth,
        autoFitColumn,
        autoFitAllColumns,
        totalWidth,
        getColLeftOffset,
        textWrap,

        // Refs
        gridContainer,
        headerContainer,
        virtualState,

        // Computed
        visibleRows,

        // Methods
        onScroll,
        scrollToCell
    };
}
