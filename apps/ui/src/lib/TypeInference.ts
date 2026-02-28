import { Hash, Type, Calendar, User, ToggleLeft, Percent } from 'lucide-vue-next';

export type ColumnType = 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'email' | 'id';

export interface InferredHeader {
    name: string;
    rawName: string;
    type: ColumnType;
    icon: any; // Lucide component
}

/**
 * Automatically infers the data type of a column by sampling up to the first 100 rows.
 * @param columns Array of column names
 * @param rows Array of row data objects
 * @returns Array of fully formed header objects ready for DataView.vue
 */
export function inferColumnTypes(columns: string[], rows: any[]): InferredHeader[] {
    const sampleSize = Math.min(100, rows.length);
    const sampleRows = rows.slice(0, sampleSize);

    return columns.map(col => {
        const rawName = col;
        const name = col.toLowerCase();

        // Default fallback
        let type: ColumnType = 'string';
        let icon = Type;

        // 1. Heuristic-based inference (from column name)
        if (name.includes('id')) {
            return { name: rawName, rawName, type: 'id', icon: Hash };
        }
        if (name.includes('email')) {
            return { name: rawName, rawName, type: 'email', icon: User };
        }

        // 2. Data-based inference (sampling)
        let nonNullCount = 0;
        let isBoolean = true;
        let isInteger = true;
        let isFloat = true;
        let isDate = true;

        for (const row of sampleRows) {
            const val = row[col];

            // Skip null/undefined for sampling, but if everything is null, it defaults to string
            if (val === null || val === undefined || val === '') {
                continue;
            }

            nonNullCount++;
            const valStr = String(val).trim();

            // Check Boolean
            if (isBoolean && typeof val !== 'boolean' && valStr.toLowerCase() !== 'true' && valStr.toLowerCase() !== 'false') {
                isBoolean = false;
            }

            // Check Numbers
            const numVal = Number(val);
            if (isNaN(numVal)) {
                isInteger = false;
                isFloat = false;
            } else {
                if (!Number.isInteger(numVal)) {
                    isInteger = false;
                }
            }

            // Check Date (basic heuristic: must parse as date, and string must be long enough to not just be a random small number)
            // e.g. "2023-01-01" or timestamps
            if (isDate) {
                if (typeof val === 'number') {
                    // Let's assume numbers are not dates for this basic inference unless they are huge (e.g. timestamps)
                    // But usually it's better to keep numbers as numbers.
                    isDate = false;
                } else {
                    const d = new Date(valStr);
                    if (isNaN(d.getTime()) || valStr.length < 5) {
                        isDate = false;
                    }
                }
            }
        }

        // Resolve Type Priority (if there is data to sample)
        if (nonNullCount > 0) {
            if (isBoolean) {
                type = 'boolean';
                icon = ToggleLeft;
            } else if (isInteger) {
                type = 'integer';
                icon = Hash;
            } else if (isFloat) {
                type = 'float';
                icon = Hash; // Could use a different icon like Percent if name includes %
                if (name.includes('percent') || name.includes('%')) {
                    icon = Percent;
                }
            } else if (isDate) {
                type = 'date';
                icon = Calendar;
            }
        }

        return { name: rawName, rawName, type, icon };
    });
}
