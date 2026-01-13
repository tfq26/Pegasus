
import { ref, onMounted, onUnmounted, watch, type Ref } from 'vue';
import { CanvasRenderer } from '../../components/TableView/Engine/CanvasRenderer';
import type { Engine } from '../../components/TableView/Engine/Engine';
import type { CellPosition, VirtualState } from '../../components/TableView/Engine/types';

export function useGridCanvas(
    engine: Engine,
    gridContainer: Ref<HTMLElement | null>,
    virtualState: Ref<VirtualState>,
    rowHeight: Ref<number>,
    rowCount: Ref<number>,
    colCount: Ref<number>,
    selection: Ref<CellPosition | null>,
    rangeSelection: Ref<{ start: CellPosition, end: CellPosition } | null>,
    getColWidth: (col: number) => number,
    callbacks: {
        selectRow: (row: number, e: MouseEvent) => void,
        onCellMouseDown: (row: number, col: number, e: MouseEvent) => void,
        onCellDblClick: (row: number, col: number, e: MouseEvent) => void
    }
) {
    const useCanvas = ref(true);
    const canvasRef = ref<HTMLCanvasElement | null>(null);
    let canvasRenderer: CanvasRenderer | null = null;
    let observer: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;

    const updateCanvas = () => {
        if (!canvasRenderer || !useCanvas.value || !gridContainer.value) return;

        const { startRow, endRow, startCol, endCol, startColLeft, scrollTop, scrollLeft } = virtualState.value;
        const width = gridContainer.value.clientWidth;
        const height = gridContainer.value.clientHeight;

        canvasRenderer.resize(width, height);

        let selectionParam = null;
        if (rangeSelection.value) {
            selectionParam = rangeSelection.value;
        } else if (selection.value) {
            selectionParam = { start: selection.value, end: selection.value };
        }

        canvasRenderer.draw({
            startRow,
            endRow,
            startCol,
            endCol,
            scrollTop: Math.floor(scrollTop),
            scrollLeft: Math.floor(scrollLeft),
            startColLeft,
            rowHeight: rowHeight.value,
            getColWidth,
            selection: selectionParam
        });
    };

    const updateTheme = () => {
        const isDark = document.documentElement.classList.contains('dark');
        canvasRenderer?.setMode(isDark);
        updateCanvas();
    };

    const getCellFromEvent = (e: MouseEvent): CellPosition | null => {
        if (!canvasRef.value) return null;

        const rect = canvasRef.value.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Map to World Coordinates: Canvas is translated by scroll keys
        // Note: x touches the canvas which includes the 40px row header
        const worldX = (x - 40) + virtualState.value.scrollLeft;
        const worldY = y + virtualState.value.scrollTop;

        const row = Math.floor(worldY / rowHeight.value);

        // Col Search (Optimization: Use binary search or cached offsets if slow, but simple loop is usually fine for visible cols)
        // Note: We need accurate worldX mapping. 
        // If col widths are variable, we must iterate.
        let cx = 0;
        let col = -1;
        // Optimization: start from startCol? 
        // No, worldX is absolute.
        // If we have access to a `getColOffset` it would be O(1).
        // For now, simple loop is what was in Grid.vue.
        for (let c = 0; c < colCount.value; c++) {
            const w = getColWidth(c);
            if (worldX >= cx && worldX < cx + w) {
                col = c;
                break;
            }
            cx += w;
        }

        if (row >= 0 && row < rowCount.value && col >= 0) return { row, col };
        return null;
    };

    const handleCanvasMouseDown = (e: MouseEvent) => {
        if (!useCanvas.value || !canvasRef.value) return;

        const rect = canvasRef.value.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Row header check (40px fixed width)
        // TODO: Pass rowHeaderWidth as config if it becomes dynamic
        if (x < 40) {
            const y = e.clientY - rect.top;
            const worldY = y + virtualState.value.scrollTop;
            const row = Math.floor(worldY / rowHeight.value);

            if (row >= 0 && row < rowCount.value) {
                callbacks.selectRow(row, e);
                return;
            }
        }

        const pos = getCellFromEvent(e);
        if (pos) {
            callbacks.onCellMouseDown(pos.row, pos.col, e);
        }
    };

    const handleCanvasDblClick = (e: MouseEvent) => {
        const pos = getCellFromEvent(e);
        if (pos) {
            callbacks.onCellDblClick(pos.row, pos.col, e);
        }
    };

    // Lifecycle
    onMounted(() => {
        if (canvasRef.value && useCanvas.value) {
            canvasRenderer = new CanvasRenderer(engine, canvasRef.value);

            // Resize Observer
            observer = new ResizeObserver(() => {
                updateCanvas();
            });
            if (gridContainer.value) {
                observer.observe(gridContainer.value);
            }

            // Theme Observer
            updateTheme();
            themeObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        updateTheme();
                    }
                }
            });
            themeObserver.observe(document.documentElement, { attributes: true });

            updateCanvas();
        }
    });

    onUnmounted(() => {
        observer?.disconnect();
        themeObserver?.disconnect();
    });

    watch([virtualState, selection, rangeSelection, useCanvas], () => {
        if (useCanvas.value) {
            requestAnimationFrame(updateCanvas);
        }
    }, { deep: true });

    return {
        useCanvas,
        canvasRef,
        updateCanvas,
        handleCanvasMouseDown,
        handleCanvasDblClick,
        getCellFromEvent
    };
}
