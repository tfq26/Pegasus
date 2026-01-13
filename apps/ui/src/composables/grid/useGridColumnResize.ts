
import { ref } from 'vue';

export function useGridColumnResize(
    getColWidth: (col: number) => number,
    setColWidth: (col: number, width: number) => void,
    autoFitColumn: (col: number) => void
) {
    const resizingColumn = ref<number | null>(null);
    const resizeStartX = ref(0);
    const resizeStartWidth = ref(0);

    const startColResize = (col: number, e: MouseEvent) => {
        // Stop bubbling to prevent sorting/selection
        e.stopPropagation();
        e.preventDefault();

        resizingColumn.value = col;
        resizeStartX.value = e.clientX;
        resizeStartWidth.value = getColWidth(col);

        document.addEventListener('mousemove', onColResizeMove);
        document.addEventListener('mouseup', stopColResize);
    };

    const onColResizeMove = (e: MouseEvent) => {
        if (resizingColumn.value === null) return;
        const delta = e.clientX - resizeStartX.value;
        const newWidth = Math.max(40, resizeStartWidth.value + delta);
        setColWidth(resizingColumn.value, newWidth);
    };

    const stopColResize = () => {
        resizingColumn.value = null;
        document.removeEventListener('mousemove', onColResizeMove);
        document.removeEventListener('mouseup', stopColResize);
    };

    const handleHeaderDblClick = (col: number, e: MouseEvent) => {
        e.stopPropagation(); // Prevent sort
        autoFitColumn(col);
    };

    return {
        resizingColumn,
        startColResize,
        handleHeaderDblClick
    };
}
