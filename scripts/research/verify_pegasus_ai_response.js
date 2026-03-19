import process from 'node:process';

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const key = token.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            args[key] = true;
            continue;
        }
        args[key] = next;
        i++;
    }
    return args;
}

function printHelp() {
    console.log(`
Usage:
  node scripts/research/verify_pegasus_ai_response.js \\
    --question "can you look at app server 2 for the last 7 days and tell me if it is doing good?" \\
    --token "<bearer_token>"

Options:
  --question        Prompt to test (required)
  --token           Bearer token. Falls back to PEGASUS_AUTH_TOKEN env var.
  --url             Endpoint URL (default: http://localhost:3000/ai/generate)
  --connectionId    connectionId payload field (default: none)
  --activeTable     activeTable payload field (optional)
  --runs            Number of repeated runs for consistency check (default: 2)
  --aiJudge         Ask Pegasus to judge the responses as an extra step (default: true)
  --debug           Print final chunk and non-progress stream events (default: false)
  --help            Show this message
`.trim());
}

async function callGenerate({ url, token, prompt, connectionId, activeTable }) {
    const payload = {
        prompt,
        activeTable: activeTable || null,
        context: []
    };
    if (connectionId && !['none', 'null', 'undefined'].includes(String(connectionId).toLowerCase())) {
        payload.connectionId = connectionId;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    const streamLog = [];
    if (!response.ok) {
        const text = await response.text();
        return {
            ok: false,
            status: response.status,
            error: text,
            streamLog
        };
    }

    const reader = response.body?.getReader();
    if (!reader) {
        return {
            ok: false,
            status: response.status,
            error: 'No response stream body available.',
            streamLog
        };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finalChunk = null;
    let progressEvents = 0;
    let streamError = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const json = JSON.parse(line);
                streamLog.push(json);
                if (json.type === 'progress') {
                    progressEvents++;
                    continue;
                }
                if (json.error) {
                    streamError = json.error;
                }
                finalChunk = json;
            } catch {
                streamLog.push({ raw: line });
            }
        }
    }

    if (buffer.trim()) {
        try {
            const tail = JSON.parse(buffer);
            streamLog.push(tail);
            if (tail.error) streamError = tail.error;
            if (tail.type !== 'progress') finalChunk = tail;
        } catch {
            streamLog.push({ raw: buffer.trim() });
        }
    }

    const text = finalChunk?.message || finalChunk?.analysis || finalChunk?.text || finalChunk?.question || '';
    const data = Array.isArray(finalChunk?.data)
        ? finalChunk.data
        : Array.isArray(finalChunk?.rows)
            ? finalChunk.rows
        : Array.isArray(finalChunk?.results)
            ? finalChunk.results
            : [];

    const hasMeaningfulFinalChunk = !!finalChunk && (typeof finalChunk === 'object') && Object.keys(finalChunk).length > 0;
    const hasAnyOutput = !!streamError || hasMeaningfulFinalChunk;

    return {
        ok: true,
        status: response.status,
        streamError,
        hasAnyOutput,
        finalChunk,
        text,
        data,
        progressEvents,
        streamLog
    };
}

function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function analyzeRuns(question, runs) {
    const analyses = runs.map((run, idx) => {
        const text = run.text || '';
        const lower = normalizeText(text);
        const hasNoDataClaim = /(no (performance )?data available|no telemetry data|impossible to determine)/i.test(text);
        const hasHealthConclusion = /(doing good|performing (well|optimally)|healthy|issues|degraded|stable)/i.test(text);
        const hasServerMention = /(appserver2|app server 2|server 2)/i.test(lower);
        const hasDateRangeMention = /(last 7 days|march 2, 2026|march 9, 2026|2026-03-02|2026-03-09)/i.test(text);
        const hasToolData = Array.isArray(run.data) && run.data.length > 0;

        return {
            run: idx + 1,
            ok: run.ok,
            status: run.status,
            streamError: run.streamError || null,
            responseLength: text.length,
            dataRows: run.data?.length || 0,
            hasNoDataClaim,
            hasHealthConclusion,
            hasServerMention,
            hasDateRangeMention,
            hasToolData,
            text
        };
    });

    const normalized = analyses.map(a => normalizeText(a.text));
    const allSame = normalized.length > 1 && normalized.every(t => t === normalized[0]);
    const anyError = analyses.some(a => !a.ok);

    const summary = {
        question,
        runCount: runs.length,
        anyError,
        allResponsesIdentical: allSame,
        runsWithDataRows: analyses.filter(a => a.dataRows > 0).length,
        runsWithNoDataClaim: analyses.filter(a => a.hasNoDataClaim).length,
        runsWithDateRangeMention: analyses.filter(a => a.hasDateRangeMention).length,
        runsWithServerMention: analyses.filter(a => a.hasServerMention).length
    };

    return { summary, analyses };
}

async function run() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    const question = args.question;
    const token = args.token || process.env.PEGASUS_AUTH_TOKEN;
    const url = args.url || 'http://localhost:3000/ai/generate';
    const connectionId = args.connectionId || null;
    const activeTable = args.activeTable || null;
    const runs = Math.max(1, Number(args.runs || 2));
    const aiJudge = args.aiJudge === 'false' ? false : true;
    const debug = args.debug === 'true' || args.debug === true;

    if (!question) {
        console.error('Missing --question');
        printHelp();
        process.exit(1);
    }
    if (!token) {
        console.error('Missing token. Provide --token or PEGASUS_AUTH_TOKEN.');
        process.exit(1);
    }

    const attempts = [];
    for (let i = 0; i < runs; i++) {
        console.log(`\n[run ${i + 1}/${runs}] prompting Pegasus AI...`);
        const result = await callGenerate({
            url,
            token,
            prompt: question,
            connectionId,
            activeTable
        });
        attempts.push(result);
        if (!result.ok) {
            console.log(`  status=${result.status} error=${result.error}`);
            continue;
        }
        const noOutputNote = result.hasAnyOutput ? '' : ' noFinalOutput=true';
        console.log(`  status=${result.status} progressEvents=${result.progressEvents} dataRows=${result.data.length} textChars=${result.text.length}${result.streamError ? ` streamError=${result.streamError}` : ''}${noOutputNote}`);
        if (debug) {
            console.log(`  finalChunk=${JSON.stringify(result.finalChunk, null, 2)}`);
            const nonProgress = result.streamLog.filter(e => e && e.type !== 'progress');
            console.log(`  nonProgressEvents=${nonProgress.length}`);
            if (nonProgress.length > 0) {
                console.log(`  nonProgressPreview=${JSON.stringify(nonProgress.slice(0, 5), null, 2)}`);
            }
        }
    }

    const { summary, analyses } = analyzeRuns(question, attempts);

    console.log('\n=== Validation Summary ===');
    console.log(JSON.stringify(summary, null, 2));
    console.log('\n=== Per-Run Analysis ===');
    console.log(JSON.stringify(analyses, null, 2));

    if (aiJudge) {
        const judgePrompt = [
            'You are validating answer quality for Pegasus AI.',
            `User question: "${question}"`,
            'Below are multiple Pegasus responses to the SAME question.',
            'Return JSON with keys: verdict (pass|warn|fail), findings (array), recommended_next_step (string).',
            '',
            JSON.stringify(analyses.map(a => ({ run: a.run, text: a.text, dataRows: a.dataRows, hasNoDataClaim: a.hasNoDataClaim })), null, 2)
        ].join('\n');

        console.log('\n[ai-judge] asking Pegasus to evaluate response quality...');
        const judge = await callGenerate({
            url,
            token,
            prompt: judgePrompt,
            connectionId,
            activeTable
        });

        if (!judge.ok) {
            console.log(`[ai-judge] failed status=${judge.status} error=${judge.error}`);
        } else {
            console.log('\n=== AI Judge Output ===');
            console.log(judge.text || JSON.stringify(judge.finalChunk, null, 2));
        }
    }
}

run().catch((err) => {
    console.error('Script failed:', err?.message || err);
    process.exit(1);
});
