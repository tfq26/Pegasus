
import { Hono } from 'hono';
import { aiClient } from '../../ai/AIClient.js';
import { supportDb } from '../db/supportDb.js';
import { supportReports } from '../db/schema.js';

const bugSageRoutes = new Hono();

bugSageRoutes.post('/analyze', async (c) => {
    try {
        const payload = await c.req.json();
        const { error, userNotes, logs, metadata, timestamp } = payload;

        console.log(`[BugSage] Received report for analysis. User Notes: ${userNotes?.substring(0, 50)}...`);

        // 1. Construct the AI prompt
        const prompt = `
            You are BugSage, a highly advanced Senior Site Reliability Engineer and Debugging Assistant.
            Your task is to analyze a bug report and logs to provide a definitive diagnosis and fix.

            --- BUG CONTEXT ---
            Error: ${error ? `${error.name}: ${error.message}` : 'Manual Trigger (No Exception)'}
            Stack Trace: ${error?.stack || 'N/A'}
            User Notes: ${userNotes || 'None provided.'}
            Timestamp: ${timestamp}
            System Metadata: ${JSON.stringify(metadata, null, 2)}

            --- LOGS (Last 200 lines) ---
            ${logs}

            --- TASK ---
            Analyze the logs and the error. Provide a report in the following JSON format:
            {
                "diagnosis": "Short summary of what went wrong",
                "root_cause": "Detailed technical explanation of the cause",
                "suggested_fix": "Step-by-step instructions or code snippets to fix the issue",
                "severity": "Low | Medium | High | Critical",
                "category": "Frontend | Backend | Database | AI | Infrastructure | Unknown",
                "confidence": 0-1 (float)
            }
        `;

        // 2. Call AI for analysis
        const analysisResponse = await aiClient.generateContent([
            { role: 'system', content: 'You are an expert SRE and debugger. Output only valid JSON.' },
            { role: 'user', content: prompt }
        ], { json: true });

        let analysis = {};
        try {
            analysis = JSON.parse(analysisResponse.text);
        } catch (e) {
            console.error("[BugSage] Failed to parse AI response as JSON:", analysisResponse.text);
            analysis = { diagnosis: "AI analysis failed to parse", raw: analysisResponse.text };
        }

        // 3. Save the report to the database
        const [report] = await supportDb.insert(supportReports).values({
            userId: metadata?.userId || null,
            url: metadata?.url || 'unknown',
            errorCode: error?.code || error?.name || 'BUG_SAGE_REPORT',
            errorMessage: error?.message || 'Analyzed Report',
            errorDetails: {
                ...analysis,
                originalError: error,
                metadata: metadata,
                logs: logs // Optional: search for logs if needed, but maybe keep them for reference
            },
            metadata: {
                source: 'BugSage',
                analyzedAt: new Date().toISOString()
            }
        }).returning();

        return c.json({
            success: true,
            reportId: report.id,
            analysis: analysis
        });

    } catch (error) {
        console.error('[BugSage] Analysis failed:', error);
        return c.json({ error: 'BugSage analysis failed', message: error.message }, 500);
    }
});

export default bugSageRoutes;
