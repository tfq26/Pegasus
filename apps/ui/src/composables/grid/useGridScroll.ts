import { ref, computed } from 'vue';
import type { Engine } from '../../../Engine/Engine';

export function useGridScroll(engine: Engine) {
    // Configuration
    const rowCount = 1000;
    const colCount = 26; // Reduced to 26 (A-Z) for better horizontal fit
    const rowHeight = 24;
    const colWidth = 100;

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

        // Sync horizontal scroll
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

        // Horizontal
        const left = col * colWidth;
        const right = (col + 1) * colWidth;
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
        colWidth,

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
