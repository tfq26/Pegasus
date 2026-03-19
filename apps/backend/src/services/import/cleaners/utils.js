export function normalizeText(value) {
    return String(value ?? '')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normalizeHeader(header, index = 0) {
    const normalized = normalizeText(header);
    return normalized || `Column_${index + 1}`;
}

export function dedupeHeaders(headers) {
    const seen = new Map();
    return headers.map((header, index) => {
        const base = normalizeHeader(header, index);
        const count = seen.get(base) || 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base}_${count + 1}`;
    });
}

export function nonEmptyEntries(row) {
    return Object.entries(row).filter(([, value]) => normalizeText(value) !== '');
}

export function isEmptyRow(row) {
    return nonEmptyEntries(row).length === 0;
}

export function sanitizeRow(row) {
    const next = {};
    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = normalizeHeader(key);
        if (typeof value === 'string') {
            next[normalizedKey] = normalizeText(value);
        } else {
            next[normalizedKey] = value;
        }
    }
    return next;
}

export function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];

    const allHeaders = [];
    rows.forEach((row) => {
        Object.keys(row || {}).forEach((key) => {
            if (!allHeaders.includes(key)) allHeaders.push(key);
        });
    });

    const dedupedHeaders = dedupeHeaders(allHeaders);
    const headerMap = new Map(allHeaders.map((header, index) => [header, dedupedHeaders[index]]));

    return rows.map((row) => {
        const normalized = {};
        for (const header of allHeaders) {
            const mapped = headerMap.get(header);
            const value = row?.[header];
            normalized[mapped] = typeof value === 'string' ? normalizeText(value) : value ?? '';
        }
        return normalized;
    });
}

export function detectRepeatedHeaderRow(row, headers) {
    const rowValues = Object.values(row).map((value) => normalizeText(value).toLowerCase()).filter(Boolean);
    const headerValues = headers.map((header) => normalizeText(header).toLowerCase()).filter(Boolean);
    if (rowValues.length === 0 || headerValues.length === 0) return false;

    const overlap = rowValues.filter((value) => headerValues.includes(value)).length;
    return overlap >= Math.max(2, Math.ceil(headerValues.length * 0.6));
}

export function looksLikeTotalRow(row) {
    return Object.values(row).some((value) => {
        const text = normalizeText(value).toLowerCase();
        return text.startsWith('total') || text.includes('grand total') || text.includes('subtotal') || text.includes('member total') || text.includes('group total');
    });
}

export function firstMeaningfulColumn(headers, rows) {
    let bestHeader = headers[0] || null;
    let bestScore = -1;
    for (const header of headers) {
        const score = rows.reduce((sum, row) => {
            const value = normalizeText(row[header]);
            if (!value) return sum;
            if (/^-?\d+(?:\.\d+)?$/.test(value)) return sum + 0.25;
            return sum + 1;
        }, 0);
        if (score > bestScore) {
            bestScore = score;
            bestHeader = header;
        }
    }
    return bestHeader;
}
