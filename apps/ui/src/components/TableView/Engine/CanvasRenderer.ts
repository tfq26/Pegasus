
import { Engine } from './Engine';
import type { CellPosition } from './types';

export interface RenderState {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
    scrollTop: number;
    scrollLeft: number;
    startColLeft: number; // Pixel offset of startCol from 0
    rowHeight: number;
    getColWidth: (col: number) => number;
    selection: { start: CellPosition, end: CellPosition } | null;
}

export class CanvasRenderer {
    private ctx: CanvasRenderingContext2D;
    private engine: Engine;
    private dpr: number = 1;
    private width: number = 0;
    private height: number = 0;

    // Theme configs
    private theme = {
        gridColor: '#e2e8f0', // slate-200
        textColor: '#0f172a', // slate-900
        font: '13px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        paddingX: 8,
        paddingY: 0, // centered vertically
        selectionColor: 'rgba(59, 130, 246, 0.10)', // blue-500 alpha
        selectionBorder: '#3b82f6', // blue-500
        headerBg: '#f8fafc', // slate-50
        headerText: '#64748b' // slate-500
    };

    constructor(engine: Engine, canvas: HTMLCanvasElement) {
        this.engine = engine;
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for opaque
        if (!ctx) throw new Error('Could not get 2D context');
        this.ctx = ctx;

        // Handle High DPI
        this.dpr = window.devicePixelRatio || 1;

        // Initial setup
        this.ctx.textBaseline = 'middle';
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;

        const canvas = this.ctx.canvas;
        canvas.width = Math.floor(width * this.dpr);
        canvas.height = Math.floor(height * this.dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        this.ctx.scale(this.dpr, this.dpr);
    }

    public draw(state: RenderState) {
        const {
            startRow, startCol, endRow, endCol,
            scrollTop, scrollLeft, startColLeft,
            rowHeight, getColWidth, selection
        } = state;

        const ctx = this.ctx;

        // 1. Clear background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.width, this.height);

        // Optimize: Batch line drawing
        ctx.beginPath();
        ctx.strokeStyle = this.theme.gridColor;
        ctx.lineWidth = 1;

        // Track x positions for columns
        let currentX = startColLeft - scrollLeft;

        // We iterate columns to draw vertical lines and cells
        // Note: we might need to draw slightly outside viewport to avoid clipping issues

        for (let c = startCol; c <= endCol; c++) {
            const width = getColWidth(c);

            // Vertical Line (Right side of column)
            // Fix: Draw at x + width
            const lineX = Math.floor(currentX + width) + 0.5; // Sharp lines
            if (lineX >= 0 && lineX <= this.width) {
                ctx.moveTo(lineX, 0);
                ctx.lineTo(lineX, this.height);
            }

            // Draw Cells in this Column
            for (let r = startRow; r <= endRow; r++) {
                const y = (r * rowHeight) - scrollTop;

                // Skip if completely outside (though endRow should handle this)
                if (y + rowHeight < 0 || y > this.height) continue;

                // Value
                const val = this.engine.getDisplayValue({ row: r, col: c });
                if (val) {
                    // Save context for clipping? 
                    // To optimize, we don't save/restore for every text.
                    // Instead we just clip if text is long.
                    // For now, simpler: no clip, or basic clip.

                    ctx.fillStyle = this.theme.textColor;
                    ctx.font = this.theme.font;

                    // Simple text positioning
                    const textX = currentX + this.theme.paddingX;
                    const textY = y + (rowHeight / 2);

                    // Basic clipping by checking width?
                    // ctx.save();
                    // ctx.beginPath();
                    // ctx.rect(currentX, y, width, rowHeight);
                    // ctx.clip();
                    ctx.fillText(val, textX, textY);
                    // ctx.restore();
                }
            }

            currentX += width;
        }

        // Draw Horizontal Lines
        for (let r = startRow; r <= endRow; r++) {
            const y = Math.floor((r * rowHeight) - scrollTop) + 0.5;
            // Valid range check
            const lineY = y + rowHeight;
            if (lineY >= 0 && lineY <= this.height) {
                ctx.moveTo(0, lineY);
                ctx.lineTo(this.width, lineY);
            }
        }

        ctx.stroke();

        // 4. Draw Selection Highlight
        if (selection) {
            this.drawSelection(selection, state);
        }
    }

    private drawSelection(
        selection: { start: CellPosition, end: CellPosition },
        state: RenderState
    ) {
        const { startRow, startCol, endRow, endCol, scrollTop, scrollLeft, startColLeft, rowHeight, getColWidth } = state;

        // Calculate selection bounds
        const s = selection.start;
        const e = selection.end;

        const minRow = Math.min(s.row, e.row);
        const maxRow = Math.max(s.row, e.row);
        const minCol = Math.min(s.col, e.col);
        const maxCol = Math.max(s.col, e.col);

        // Only draw if visible
        if (maxRow < startRow || minRow > endRow || maxCol < startCol || minCol > endCol) {
            return;
        }

        // Calculate Pixel Rect
        const top = (minRow * rowHeight) - scrollTop;
        const height = ((maxRow - minRow + 1) * rowHeight);

        // X Calculation requires iterating widths from startCol specific logic
        // We know startColLeft corresponds to startCol.
        // If selection starts BEFORE startCol, we need to calculate backwards or assume offscreen.
        // Simpler: iterate from startCol to find left/width.

        let left = 0;
        let width = 0;

        // Find 'left'
        let currentX = startColLeft - scrollLeft;

        // This iteration logic needs to be robust for any startCol.
        // It's tricky to map arbitrary col to X without global map.
        // Implication: CanvasRenderer expects state.startColLeft to be correct for state.startCol.

        // If selection.minCol < startCol:
        // We need X for minCol. 
        // Hack: If strict virtualization, we don't know widths of cols before startCol easily without iterating ALL.
        // Solution: Grid.vue / useGridScroll usually knows precise offset of active viewport.
        // For selection drawing, we might clip to viewport.

        // Approximating for visible part of selection:
        const visibleMinCol = Math.max(minCol, startCol);
        const visibleMaxCol = Math.min(maxCol, endCol);

        // We need X of visibleMinCol relative to startCol
        let x = startColLeft - scrollLeft;

        // Iterate to find start of selection VISIBLE area
        for (let c = startCol; c < visibleMinCol; c++) {
            x += getColWidth(c);
        }
        left = x;

        // Iterate to find width
        width = 0;
        for (let c = visibleMinCol; c <= visibleMaxCol; c++) {
            width += getColWidth(c);
        }

        // Draw
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.selectionColor;
        ctx.fillRect(left, top, width, height);

        ctx.strokeStyle = this.theme.selectionBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, width, height);
    }
}
