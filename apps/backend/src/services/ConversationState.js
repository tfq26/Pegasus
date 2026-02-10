/**
 * Conversation State Manager
 * Tracks context across conversation turns for natural follow-up handling.
 */
import { db } from '../db/index.js';
import { chats } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export class ConversationState {
    /**
     * Build conversation context from chat history
     * @param {string} chatId - Current chat ID
     * @param {string} currentMessage - The new user message
     * @returns {object} Context with history, entities, and follow-up detection
     */
    static async buildContext(chatId, currentMessage) {
        const context = {
            history: [],
            entities: {
                lastTable: null,
                lastColumns: [],
                lastFilters: [],
                lastAggregation: null,
                lastVisualization: null,
                lastQuery: null
            },
            isFollowUp: false,
            contextPrompt: ''
        };

        if (!chatId) return context;

        try {
            // 1. Fetch recent messages from chat
            const chatRow = await db.query.chats.findFirst({
                where: eq(chats.id, chatId),
                columns: { messages: true }
            });

            if (!chatRow?.messages) return context;

            // Get last 6 messages (3 exchanges)
            const messages = chatRow.messages || [];
            const lastN = messages.slice(-6);
            context.history = lastN;

            // 2. Extract entities from history
            for (const msg of lastN) {
                if (msg.role === 'assistant') {
                    // Extract from tool calls
                    if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
                        for (const call of msg.toolCalls) {
                            this._extractFromToolCall(call, context.entities);
                        }
                    }
                    // Extract from content if it contains query info
                    if (msg.content && typeof msg.content === 'string') {
                        this._extractFromContent(msg.content, context.entities);
                    }
                }
            }

            // 3. Detect if current message is a follow-up
            context.isFollowUp = this.detectFollowUp(currentMessage, context.entities);

            // 4. Build context prompt for AI
            context.contextPrompt = this._buildContextPrompt(context.entities, context.isFollowUp, lastN);

            return context;

        } catch (error) {
            console.error('[ConversationState] Error building context:', error);
            return context;
        }
    }

    /**
     * Extract entities from a tool call
     * @private
     */
    static _extractFromToolCall(call, entities) {
        if (!call?.function?.name) return;

        try {
            const args = typeof call.function.arguments === 'string'
                ? JSON.parse(call.function.arguments)
                : call.function.arguments;

            if (call.function.name === 'query_data') {
                entities.lastTable = args.table || args.tableName || entities.lastTable;
                entities.lastQuery = args.query || args.sql || entities.lastQuery;

                // Parse columns from query if present
                if (args.query) {
                    const selectMatch = args.query.match(/SELECT\s+(.+?)\s+FROM/i);
                    if (selectMatch) {
                        const cols = selectMatch[1].split(',').map(c => c.trim().replace(/["`]/g, ''));
                        entities.lastColumns = cols.filter(c => c !== '*' && !c.includes('('));
                    }
                }
            }

            if (call.function.name === 'generate_visualization') {
                entities.lastVisualization = {
                    type: args.type || args.chartType,
                    xAxis: args.xAxis,
                    yAxis: args.yAxis
                };
            }

            if (call.function.name === 'generate_table') {
                entities.lastTable = args.tableName || entities.lastTable;
            }

        } catch (e) {
            // Parsing failed, skip
        }
    }

    /**
     * Extract entities from assistant content
     * @private
     */
    static _extractFromContent(content, entities) {
        // Look for SQL queries in content
        const sqlMatch = content.match(/```sql\s*([\s\S]*?)```/i);
        if (sqlMatch) {
            entities.lastQuery = sqlMatch[1].trim();

            // Extract table from FROM clause
            const fromMatch = entities.lastQuery.match(/FROM\s+["`]?(\w+)["`]?/i);
            if (fromMatch) {
                entities.lastTable = fromMatch[1];
            }
        }

        // Look for explicit table mentions
        const tableMatch = content.match(/from\s+(?:the\s+)?["`']?(\w+)["`']?\s+table/i);
        if (tableMatch && !entities.lastTable) {
            entities.lastTable = tableMatch[1];
        }
    }

    /**
     * Detect if the current message is a follow-up to previous context
     */
    static detectFollowUp(message, entities) {
        if (!message || typeof message !== 'string') return false;

        const lower = message.toLowerCase().trim();

        // 1. Explicit follow-up patterns
        const explicitPatterns = [
            /^(now|also|and|but|what about|how about)\b/i,
            /^(break|split|group|filter|show|compare|sort)\s+(it|this|that|them)\b/i,
            /^(same|similar|like before|like that)\b/i,
            /^(instead|rather|change|modify|update)\b/i,
            /^(add|remove|exclude|include)\s+(a|the)?\s*(filter|column|group)/i,
            /^(can you|could you)\s+(also|now)\b/i,
            /\b(the same data|this data|that data|these results)\b/i,
            // NEW: More follow-up patterns
            /^filter\s+by\b/i,
            /^filter\s+\w+\s+(by|to|only)/i,
            /^(compare|vs|versus)\s+(with|to)?/i,
            /^(limit|top|first|last)\s+\d+/i,
            /^(for|in)\s+(q[1-4]|20\d{2}|last\s+(year|month|week))/i,
            /^only\s+/i,
            /\bonly\s*$/i,
        ];

        if (explicitPatterns.some(p => p.test(lower))) {
            return true;
        }

        // 2. Implicit follow-up: references to previous context
        if (entities.lastTable) {
            // Short message that doesn't mention a table = likely follow-up
            const hasTableMention = lower.includes(entities.lastTable.toLowerCase());
            const isShortQuery = lower.length < 60;
            const hasActionVerb = /^(show|list|get|find|display|give|tell)/i.test(lower);

            if (isShortQuery && hasActionVerb && !hasTableMention) {
                return true;
            }
        }

        // 3. Pronoun references
        if (/\b(it|this|that|these|those)\b/i.test(lower) && entities.lastTable) {
            return true;
        }

        // 4. Temporal refinement (year, quarter, month references without table)
        if (entities.lastTable && /\b(20\d{2}|q[1-4]|last\s+(year|month)|this\s+(year|month))\b/i.test(lower)) {
            // Short temporal filter without explicit table mention
            if (lower.length < 80 && !lower.includes('from ')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Build a context prompt for the AI
     * @private
     */
    static _buildContextPrompt(entities, isFollowUp, history) {
        if (!isFollowUp || !entities.lastTable) {
            return '';
        }

        let prompt = `
[CONVERSATION CONTEXT]
This is a FOLLOW-UP message. The user is continuing from a previous query.

PREVIOUS CONTEXT:
- Last table used: "${entities.lastTable}"
${entities.lastColumns.length > 0 ? `- Last columns analyzed: ${entities.lastColumns.join(', ')}` : ''}
${entities.lastQuery ? `- Last query pattern: ${entities.lastQuery.substring(0, 150)}...` : ''}
${entities.lastVisualization ? `- Last visualization: ${entities.lastVisualization.type} chart` : ''}

FOLLOW-UP RULES:
1. If user says "break it down by X" → Add X to GROUP BY of the previous context
2. If user says "filter by X" or "only X" → Add WHERE clause to previous context  
3. If user says "show as chart/graph" → Visualize the same data
4. If user says "compare with Y" → JOIN or UNION with Y table
5. If user says "sort by X" → Add ORDER BY X
6. ASSUME the user wants to build upon the previous result, not start fresh

`;

        // Add recent exchange for reference
        const lastUserMsg = history.filter(m => m.role === 'user').pop();
        if (lastUserMsg?.content) {
            prompt += `Previous user request: "${lastUserMsg.content.substring(0, 200)}"\n`;
        }

        return prompt;
    }

    /**
     * Summarize conversation for context injection (compact version)
     */
    static summarizeForPrompt(context) {
        if (!context.isFollowUp) return '';
        return context.contextPrompt;
    }
}
