/**
 * Simple XML to JSON parser
 * Converts XML string to JSON object
 */
export function parseXML(xml) {
    xml = xml.replace(/>\s+</g, '><').trim(); // Remove whitespace between tags

    const result = {};
    let current = result;
    const stack = [];

    const tagRegex = /<(\/?[a-zA-Z0-9_:-]+)([^>]*)>|([^<]+)/g;
    let match;

    while ((match = tagRegex.exec(xml)) !== null) {
        if (match[1]) { // Tag
            const tagName = match[1];
            const isClosing = tagName.startsWith('/');
            const name = isClosing ? tagName.slice(1) : tagName;

            if (isClosing) {
                const last = stack.pop();
                if (last.name !== name) {
                    throw new Error(`Mismatched tag: expected ${last.name}, got ${name}`);
                }
                current = last.parent;
            } else {
                const isSelfClosing = match[2].endsWith('/');
                const attributesStr = isSelfClosing ? match[2].slice(0, -1) : match[2];

                const attributes = {};
                const attrRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
                let attrMatch;
                while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
                    attributes[attrMatch[1]] = attrMatch[2];
                }

                const newNode = {};
                // If we have attributes, store them (optional, depending on desired output structure)
                // For simplicity in this specific use case (data ingestion), we might ignore attributes 
                // or store them in a specific key like _attributes.
                if (Object.keys(attributes).length > 0) {
                    newNode._attributes = attributes;
                }

                if (!current[name]) {
                    current[name] = newNode;
                } else if (Array.isArray(current[name])) {
                    current[name].push(newNode);
                } else {
                    current[name] = [current[name], newNode];
                }

                if (!isSelfClosing) {
                    stack.push({ name, node: newNode, parent: current });
                    current = newNode;
                }
            }
        } else if (match[3]) { // Text content
            const text = match[3].trim();
            if (text) {
                // If the current node already has properties (attributes or other tags), 
                // we might need a special key for text, e.g., _text.
                // If it's empty, we can just set it as the value (but we already created an object).
                // Strategy: If current object is empty (except _attributes), replace/augment it.

                // Check if current has children tags
                const hasChildren = Object.keys(current).some(k => k !== '_attributes');

                if (!hasChildren) {
                    // It's a leaf node with text
                    // We need to go back to parent and set the value directly if there are no attributes
                    // But we are already "inside" the node object 'current'.
                    // This structure { tag: { _text: "value" } } is safer.
                    current._text = text;
                }
            }
        }
    }

    return result;
}

/**
 * Flattens the parsed XML object into an array of records if possible.
 * Heuristic: Look for the first array in the structure and use that as the list of rows.
 */
export function flattenXML(xmlObj) {
    // DFS to find the first array
    const stack = [xmlObj];
    while (stack.length > 0) {
        const curr = stack.pop();
        if (Array.isArray(curr)) {
            return curr.map(simplifyNode);
        }
        if (curr && typeof curr === 'object') {
            for (const key in curr) {
                if (Array.isArray(curr[key])) {
                    return curr[key].map(simplifyNode);
                }
                stack.push(curr[key]);
            }
        }
    }
    return [];
}

function simplifyNode(node) {
    if (typeof node !== 'object' || node === null) return node;
    const simple = {};
    for (const key in node) {
        if (key === '_attributes') continue;
        if (key === '_text') {
            // If node only has _text, return the text directly? 
            // No, we want a flat object for DB.
            // If mixed, maybe ignore?
            continue;
        }

        const val = node[key];
        if (typeof val === 'object' && val._text) {
            simple[key] = val._text;
        } else if (typeof val !== 'object') {
            simple[key] = val;
        } else {
            // Nested object - stringify or flatten?
            // For now, JSON stringify nested objects
            simple[key] = JSON.stringify(val);
        }
    }
    return simple;
}
