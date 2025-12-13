import { Engine } from './Engine';
import type { CellPosition } from './types';

export interface SearchOptions {
    matchCase: boolean;
    matchEntireCell: boolean;
    searchInFormulas: boolean;
    useRegex: boolean;
}

export interface SearchResult {
    pos: CellPosition;
    value: string;
    matchIndex: number;
}

export class SearchEngine {
    constructor(private engine: Engine) { }

    public find(query: string, options: SearchOptions): SearchResult[] {
        const results: SearchResult[] = [];
        if (!query) return results;

        let regex: RegExp | null = null;
        if (options.useRegex) {
            try {
                regex = new RegExp(query, options.matchCase ? 'g' : 'gi');
            } catch (e) {
                console.error('Invalid regex', e);
                return [];
            }
        }

        const lowerQuery = options.matchCase ? query : query.toLowerCase();

        // Iterate all cells
        // Using getCells() which returns Map<string, CellData>
        for (const [key, cell] of this.engine.getCells()) {
            const parts = key.split(',').map(Number);
            const row = parts[0];
            const col = parts[1];

            if (row === undefined || col === undefined) continue;

            let content = String(cell.value);
            if (options.searchInFormulas && cell.rawInput?.startsWith('=')) {
                content = cell.rawInput;
            }

            if (content === null || content === undefined) continue;
            content = String(content);

            let isMatch = false;

            if (regex) {
                isMatch = regex.test(content);
                regex.lastIndex = 0; // Reset for next test
            } else {
                const checkContent = options.matchCase ? content : content.toLowerCase();
                if (options.matchEntireCell) {
                    isMatch = checkContent === lowerQuery;
                } else {
                    isMatch = checkContent.includes(lowerQuery);
                }
            }

            if (isMatch) {
                results.push({
                    pos: { row, col },
                    value: content,
                    matchIndex: results.length
                });
            }
        }

        // Sort results by row, then col to be intuitive
        results.sort((a, b) => {
            if (a.pos.row !== b.pos.row) return a.pos.row - b.pos.row;
            return a.pos.col - b.pos.col;
        });

        // Re-index matchIndex after sort
        results.forEach((r, i) => r.matchIndex = i);

        return results;
    }

    public replace(pos: CellPosition, newValue: string) {
        this.engine.setValue(pos, newValue);
    }

    public replaceAll(results: SearchResult[], newValue: string) {
        // Use transaction batching if possible, but for now sequential
        // Creating a single undo command for this would be ideal, 
        // but implementing a BatchCommand is a nice-to-have.
        // For now, individual replaces.
        results.forEach(res => {
            this.engine.setValue(res.pos, newValue);
        });
    }
}
