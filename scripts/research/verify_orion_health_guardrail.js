import process from 'node:process';

const URL = process.env.PEGASUS_URL || 'http://localhost:3000/ai/generate';
const TOKEN = process.env.PEGASUS_AUTH_TOKEN;
const CONNECTION_ID = process.env.PEGASUS_CONNECTION_ID || '99b8f8b5-6609-48ce-baa0-d045c8414c0f';
const QUESTION = 'can you look at app server 2 for the last 7 days and tell me if it is doing good?';

if (!TOKEN) {
  console.error('Missing PEGASUS_AUTH_TOKEN');
  process.exit(1);
}

async function callGenerate() {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`
    },
    body: JSON.stringify({
      prompt: QUESTION,
      connectionId: CONNECTION_ID,
      context: []
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream body available');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalChunk = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const json = JSON.parse(line);
      if (json.type !== 'progress') finalChunk = json;
    }
  }

  if (buffer.trim()) {
    const tail = JSON.parse(buffer);
    if (tail.type !== 'progress') finalChunk = tail;
  }

  return finalChunk;
}

async function main() {
  const chunk = await callGenerate();
  if (!chunk) {
    console.error('No final chunk');
    process.exit(1);
  }

  const query = String(chunk.query || '');
  const data = chunk.data || chunk.rows || chunk.results || [];
  const text = String(chunk.text || chunk.message || chunk.analysis || '').toLowerCase();

  const failures = [];
  if (!query.trim()) failures.push('query is empty');
  if (!Array.isArray(data) || data.length === 0) failures.push('response data is empty');
  if (/no (performance )?data|no telemetry|no matching metrics|zero active instances/.test(text)) {
    failures.push('response still claims no data');
  }

  console.log('Final chunk summary:', JSON.stringify({
    query,
    data,
    text: chunk.text || chunk.message || chunk.analysis || ''
  }, null, 2));

  if (failures.length > 0) {
    console.error('Health guardrail check failed:', failures.join('; '));
    process.exit(1);
  }

  console.log('Health guardrail check passed.');
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});

