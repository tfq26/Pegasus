
import { Hono } from 'hono';
import { aiClient } from '../../ai/AIClient.js';
import { supportDb } from '../db/supportDb.js';
import { supportReports } from '../db/schema.js';

const piscesRoutes = new Hono();

piscesRoutes.post('/analyze', async (c) => {
    console.log(`[Pisces] HIT /support/analyze route`);
    try {
        const payload = await c.req.json();
        const { error, userNotes, logs, metadata, timestamp } = payload;

        console.log(`[Pisces] Received report for analysis. User Notes: ${userNotes?.substring(0, 50)}...`);

        // Truncate logs to avoid context limits (approx 20k chars)
        const truncatedLogs = logs && logs.length > 20000 ? logs.substring(logs.length - 20000) : logs;

        // 1. Construct the AI prompt
        const prompt = `
            You are Pisces, a highly advanced Senior Site Reliability Engineer and Debugging Assistant.
            Your task is to analyze a bug report and logs to provide a definitive diagnosis and fix.

            --- BUG CONTEXT ---
            Error: ${error ? `${error.name}: ${error.message}` : 'Manual Trigger (No Exception)'}
            Stack Trace: ${error?.stack || 'N/A'}
            User Notes: ${userNotes || 'None provided.'}
            Timestamp: ${timestamp}
            System Metadata: ${JSON.stringify(metadata, null, 2)}

            --- LOGS (Last snippet) ---
            ${truncatedLogs}

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

        // 2. Call AI for analysis (Force gemini-3-pro-preview as requested)
        const analysisResponse = await aiClient.generateContent([
            { role: 'system', content: 'You are an expert SRE and debugger. Output only valid JSON.' },
            { role: 'user', content: prompt }
        ], { model: 'gemini-3-pro-preview', json: true });

        let analysis = null;

        try {
            // Clean up the response text 
            let cleanText = analysisResponse.text.trim();

            // Remove markdown formatting
            if (cleanText.startsWith('```json')) {
                cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanText.startsWith('```')) {
                cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            // Robust JSON extraction: Find first '{' and last '}'
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanText = cleanText.substring(firstBrace, lastBrace + 1);
            }

            analysis = JSON.parse(cleanText);

            // Ensure all fields exist
            const defaults = {
                diagnosis: "Analysis incomplete.",
                root_cause: "Could not determine root cause.",
                suggested_fix: "Please review logs manually.",
                severity: "Low",
                category: "Unknown",
                confidence: 0
            };
            analysis = { ...defaults, ...analysis };

        } catch (e) {
            console.error("[Pisces] Failed to parse AI response as JSON:", analysisResponse.text);
            analysis = {
                diagnosis: "AI analysis failed to parse response.",
                root_cause: "The AI returned an invalid format. Raw response available in logs.",
                suggested_fix: "Check backend logs for raw AI output.",
                severity: "Unknown",
                category: "Unknown",
                confidence: 0,
                raw: analysisResponse.text
            };
        }

        // 3. Save the report to the database
        const [report] = await supportDb.insert(supportReports).values({
            userId: metadata?.userId || null,
            url: metadata?.url || 'unknown',
            errorCode: error?.code || error?.name || 'PISCES_REPORT',
            errorMessage: error?.message || 'Analyzed Report',
            errorDetails: {
                ...analysis,
                originalError: error,
                metadata: metadata,
                logs: logs // Optional: search for logs if needed, but maybe keep them for reference
            },
            metadata: {
                source: 'Pisces',
                analyzedAt: new Date().toISOString()
            }
        }).returning();

        return c.json({
            success: true,
            reportId: report.id,
            analysis: analysis
        });

    } catch (error) {
        console.error('[Pisces] Analysis failed:', error);
        return c.json({ error: 'Pisces analysis failed', message: error.message }, 500);
    }
});

export default piscesRoutes;
