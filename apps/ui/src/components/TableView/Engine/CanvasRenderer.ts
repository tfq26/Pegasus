
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
    private isDark = false;

    private lightTheme = {
        gridColor: '#e2e8f0', // slate-200
        textColor: '#0f172a', // slate-900
        backgroundColor: '#ffffff',
        headerBg: '#f8fafc', // slate-50
        headerText: '#64748b', // slate-500
        paddingX: 8,
        paddingY: 0,
        selectionColor: 'rgba(124, 58, 237, 0.10)', // violet-600 with opacity
        selectionBorder: '#7c3aed', // violet-600
        rowHeaderWidth: 40,
        font: '13px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    };

    private darkTheme = {
        gridColor: '#3b3b3f', // stone-700
        textColor: '#f8fafc', // slate-50
        backgroundColor: '#151517', // stone-900 conforming to global theme
        headerBg: '#252527', // stone-800
        headerText: '#94a3b8', // slate-400
        paddingX: 8,
        paddingY: 0,
        selectionColor: 'rgba(139, 92, 246, 0.20)', // violet-500 with opacity
        selectionBorder: '#8b5cf6', // violet-500
        rowHeaderWidth: 40,
        font: '13px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    };

    private theme = this.lightTheme;

    public setMode(isDark: boolean) {
        this.isDark = isDark;
        this.theme = isDark ? this.darkTheme : this.lightTheme;
    }

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
        this.dpr = window.devicePixelRatio || 1;
        this.width = width;
        this.height = height;

        const canvas = this.ctx.canvas;
        const targetWidth = Math.floor(width * this.dpr);
        const targetHeight = Math.floor(height * this.dpr);

        // prevent redundant resizing which clears context and kills perf
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            // Context is reset when width/height changes, so we must re-scale
            this.ctx.scale(this.dpr, this.dpr);
            this.ctx.textBaseline = 'middle'; // Restore baseline
        }
    }

    public draw(state: RenderState) {
        const {
            startRow, startCol, endRow, endCol,
            scrollTop, scrollLeft, startColLeft,
            rowHeight, getColWidth, selection
        } = state;

        const ctx = this.ctx;

        // 1. Clear background
        ctx.fillStyle = this.theme.backgroundColor;
        ctx.fillRect(0, 0, this.width, this.height);

        // --- Pass 1: Draw Cells (Backgrounds + Content) ---
        let currentX = (startColLeft - scrollLeft) + this.theme.rowHeaderWidth;

        for (let c = startCol; c <= endCol; c++) {
            const width = getColWidth(c);

            // Draw Cells in this Column
            for (let r = startRow; r <= endRow; r++) {
                const y = (r * rowHeight) - scrollTop;

                // Skip if completely outside
                if (y + rowHeight < 0 || y > this.height) continue;

                const cell = this.engine.getCell({ row: r, col: c });
                if (cell) {
                    // Background
                    if (cell.style?.background) {
                        ctx.fillStyle = cell.style.background;
                        ctx.fillRect(currentX, y, width, rowHeight);
                    }

                    // Content
                    const val = String(cell.value ?? '');
                    if (val) {
                        // Font Style
                        let font = this.theme.font;
                        if (cell.style?.bold) font = 'bold ' + font;
                        if (cell.style?.italic) font = 'italic ' + font;
                        ctx.font = font;

                        // Text Color
                        ctx.fillStyle = cell.style?.color || this.theme.textColor;

                        // Text Alignment
                        const align = cell.style?.align || 'left';
                        let textX = currentX + this.theme.paddingX;

                        // Center/Right alignment adjustments
                        if (align === 'center') {
                            textX = currentX + (width / 2);
                            ctx.textAlign = 'center';
                        } else if (align === 'right') {
                            textX = currentX + width - this.theme.paddingX;
                            ctx.textAlign = 'right';
                        } else {
                            ctx.textAlign = 'left';
                        }

                        const textY = y + (rowHeight / 2);

                        // Clip text to cell width
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(currentX, y, width, rowHeight);
                        ctx.clip();
                        ctx.fillText(val, textX, textY);
                        ctx.restore();
                    }

                    // Live Data Indicator (from feature/LiveAPISpreadsheets)
                    if (this.engine.cellBindings.get(`${r},${c}`)) {
                        this.drawLiveIndicator(currentX, y, width, rowHeight);
                    }
                }
            }
            currentX += width;
        }

        // --- Pass 2: Draw Grid Lines (On Top) ---
        ctx.beginPath();
        ctx.strokeStyle = this.theme.gridColor;
        ctx.lineWidth = 1;

        // Vertical Lines
        let gridCurrentX = (startColLeft - scrollLeft) + this.theme.rowHeaderWidth;
        for (let c = startCol; c <= endCol; c++) {
            const width = getColWidth(c);
            const lineX = Math.floor(gridCurrentX + width) + 0.5;

            if (lineX >= this.theme.rowHeaderWidth && lineX <= this.width) {
                ctx.moveTo(lineX, 0);
                ctx.lineTo(lineX, this.height);
            }
            gridCurrentX += width;
        }

        // Horizontal Lines
        for (let r = startRow; r <= endRow; r++) {
            const y = Math.floor((r * rowHeight) - scrollTop) + 0.5;
            const lineY = y + rowHeight;
            if (lineY >= 0 && lineY <= this.height) {
                ctx.moveTo(this.theme.rowHeaderWidth, lineY);
                ctx.lineTo(this.width, lineY);
            }
        }
        ctx.stroke();

        // 4. Draw Selection Highlight
        if (selection) {
            this.drawSelection(selection, state);
        }

        // 5. Draw Row Headers (Sticky)
        this.drawRowHeaders(state);
    }

    private drawRowHeaders(state: RenderState) {
        const { startRow, endRow, scrollTop, rowHeight } = state;
        const ctx = this.ctx;
        const width = this.theme.rowHeaderWidth;

        // Header Background
        ctx.fillStyle = this.theme.headerBg;
        ctx.fillRect(0, 0, width, this.height);

        // Right side border
        ctx.strokeStyle = this.theme.gridColor;
        ctx.beginPath();
        ctx.moveTo(width - 0.5, 0);
        ctx.lineTo(width - 0.5, this.height);

        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = this.theme.headerText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let r = startRow; r <= endRow; r++) {
            const y = (r * rowHeight) - scrollTop;
            if (y + rowHeight < 0 || y > this.height) continue;

            const textX = width / 2;
            const textY = y + (rowHeight / 2);

            ctx.fillText((r + 1).toString(), textX, textY);

            // Row separator
            ctx.moveTo(0, Math.floor(y + rowHeight) + 0.5);
            ctx.lineTo(width, Math.floor(y + rowHeight) + 0.5);
        }
        ctx.stroke();
    }

    private drawLiveIndicator(x: number, y: number, width: number, height: number) {
        const ctx = this.ctx;
        const size = 6;
        ctx.fillStyle = '#22c55e'; // green-500
        ctx.beginPath();
        ctx.moveTo(x, y + height);
        ctx.lineTo(x + size, y + height);
        ctx.lineTo(x, y + height - size);
        ctx.closePath();
        ctx.fill();
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
        left = x + this.theme.rowHeaderWidth;

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
