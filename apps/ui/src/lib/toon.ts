// src/lib/toon.ts
// TOON serialization utility for Pegasus

// Example: [{a:1,b:2},{a:3,b:4}] => TOON: a,b\n1,2\n3,4

export function toToon(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const keys = Object.keys(arr[0]);
  const header = keys.join(',');
  const rows = arr.map(obj => keys.map(k => obj[k]).join(',')).join('\n');
  return `${header}\n${rows}`;
}

export function fromToon(toon) {
  const [header, ...rows] = toon.trim().split(/\r?\n/);
  const keys = header.split(',');
  return rows.map(row => {
    const values = row.split(',');
    const obj = {};
    keys.forEach((k, i) => { obj[k] = values[i]; });
    return obj;
  });
}
