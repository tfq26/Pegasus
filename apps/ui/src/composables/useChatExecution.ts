import { ref, type Ref, nextTick } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatStore } from '@/stores/chat'
// useChat removed to avoid circular dependency
// Chat.vue provides createChat

import { toast } from '@/composables/useNotifications'
import { useProgress } from '@/lib/progress'
import { generateAIQuery, recommendVisualization, analyzeResults } from '@/lib/api'
import { api, getAuthHeaders } from '@/lib/apiClient'
import { buildConnectionPayload } from '@/lib/db-connections'
import { sanitizeAIResponse } from '@/lib/ai-response-sanitizer'
import { useConnectionStore } from '@/stores/connection'
import { useChatDialogs } from '@/composables/useChatDialogs'

export function useChatExecution(
    mode: Ref<string>,
    chatInput: Ref<string>,
    writeInput: Ref<string>,
    selectedChatId: Ref<string>,
    selectedConnection: Ref<any>,
    chatHistory: Ref<any[]>,
    resultsPanelVisible: Ref<boolean>,
    dashboardPreviewConfig: Ref<any>,
    dashboardPreviewVisible: Ref<boolean>,
    options: {
        aiOptions: Ref<any>,
        encryptionKey: Ref<any>,
        createChat: (title?: string) => Promise<any>, // Callback to avoid circular dependency
        onAIResponse?: (response: any) => void
    }
) {
    const workspaceStore = useWorkspaceStore()
    const chatStore = useChatStore()
    const { startOperation, finishOperation, failOperation, withProgress } = useProgress()
    const { openMutation } = useChatDialogs()

    // State managed by this composable
    const isExecuting = ref(false)
    const queryError = ref('')
    const queryResult = ref<any>(null)
    const lastQuery = ref('')
    const abortController = ref<AbortController | null>(null)
    const currentOpId = ref('')
    const visualizableResult = ref<any>(null)
    const suggestedChartType = ref<string | null>(null)
    const currentExecutionSteps = ref<{ message: string, timestamp: number, progress: number }[]>([])

    // --- Helpers ---
    const normalizeQuery = (query: string, provider: string) => {
        if (!query) return ''
        let trimmed = query.trim()

        // Strip markdown code blocks
        trimmed = trimmed.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()

        // Strip ALL leading/trailing backticks (unbalanced or not)
        trimmed = trimmed.replace(/^`+|`+$/g, '').trim()

        // HEURISTIC: If query looks like a simple table name
        // Allowed chars: alphanumeric, underscore, dash, dot (schema.table)
        if (/^[a-zA-Z0-9_.-]+$/.test(trimmed) && !/^(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(trimmed)) {
            // It's likely just a table name
            // Use double quotes for safety unless it already has them (and isn't using dot notation which might complicate quoting)
            if (!trimmed.includes('"') && !trimmed.includes('.')) {
                return `SELECT * FROM "${trimmed}"`
            }
            return `SELECT * FROM ${trimmed}`
        }

        // SurrealDB is strict about semicolons between statements
        if (provider === 'surrealdb') {
            const statements = trimmed.split(/\n\s*(?=SELECT|UPDATE|DELETE|INSERT|CREATE|REMOVE|DEFINE|LET|BEGIN|COMMIT|CANCEL|RELATE|UPSERT|INFO|USE|LIVE|KILL|SHOW)/i)
            if (statements.length > 1) {
                return statements.map(s => {
                    let sTrim = s.trim()
                    return sTrim.endsWith(';') ? sTrim : sTrim + ';'
                }).join('\n')
            }
            if (!trimmed.endsWith(';')) return trimmed + ';'
        }
        return trimmed
    }

    const handleCancelQuery = () => {
        if (abortController.value) {
            abortController.value.abort()
            abortController.value = null
        }
        isExecuting.value = false
        toast.info('Execution cancelled')
    }

    const stopExecution = () => handleCancelQuery()

    // --- Core Actions ---

    const handleCreateDashboardElement = async (groupId?: string) => {
        // Logic from Chat.vue
        if (dashboardPreviewConfig.value && dashboardPreviewVisible.value) {
            // Already visible?
            return
        }

        if (!queryResult.value || !lastQuery.value) {
            toast.error('No results to visualize', {
                description: 'Run a query first to get results, then click Visualize.'
            })
            return
        }

        try {
            // Use local heuristic generator - INSTANT, no AI needed!
            const { generateChartConfig } = await import('@/lib/chartGenerator')

            let dataForVisualization = queryResult.value
            if (visualizableResult.value) {
                dataForVisualization = visualizableResult.value
                visualizableResult.value = null
                suggestedChartType.value = null
            }

            const dataArray = Array.isArray(dataForVisualization) ? dataForVisualization : [dataForVisualization]
            const config = generateChartConfig(dataArray, lastQuery.value)

            console.log('[Visualize] Generated config (instant):', config)

            if (!config || !config.type) {
                throw new Error('Could not generate chart from this data')
            }

            dashboardPreviewConfig.value = config
            dashboardPreviewVisible.value = true
        } catch (error: any) {
            console.error('[Visualize] Error:', error)
            toast.error('Failed to generate chart', {
                description: error.message || 'Unable to create visualization'
            })
        }
    }

    const run = async () => {
        let activeInput = ''
        if (mode.value === 'chat') {
            activeInput = chatInput.value
        } else if (mode.value === 'write') {
            // Get content from active query tab via workspace store directly
            const activeTab = workspaceStore.activeTab as any
            const tabValue = activeTab && (activeTab.value || activeTab)
            if (tabValue?.type === 'query') {
                activeInput = tabValue.data?.content || writeInput.value
            } else {
                activeInput = writeInput.value
            }
        } else {
            return
        }

        if (!activeInput.trim()) return
        if (!selectedConnection.value) {
            queryError.value = 'Pick a saved database connection in Settings.'
            return
        }

        if (mode.value === 'write') {
            // SQL Execution
            await executeSQL(activeInput.trim())
        } else {
            // AI Generation
            await handleAIGenerate()
        }
    }

    const executeSQL = async (payload: string) => {
        const timestamp = Date.now()
        resultsPanelVisible.value = true
        isExecuting.value = true
        queryError.value = ''
        queryResult.value = null
        queryResult.value = null
        lastQuery.value = payload
        currentExecutionSteps.value = []

        if (abortController.value) abortController.value.abort()
        abortController.value = new AbortController()

        const opId = `query-exec-${Date.now()}`
        currentOpId.value = opId
        startOperation(opId, `Executing Query`, { cancellable: true, onCancel: handleCancelQuery })

        try {
            const response = await api.post<any>('/query', {
                provider: selectedConnection.value.provider,
                connection: buildConnectionPayload(selectedConnection.value),
                query: normalizeQuery(payload, selectedConnection.value.provider),
                source: 'user',
                model: null
            }, {
                signal: abortController.value.signal
            })

            const body = response
            if (body.error) throw new Error(body.error ?? 'Execution failed')

            queryResult.value = body.result ?? null
            finishOperation(opId)
            toast.success('Query executed')

            // Update Chat History (UI Sync)
            chatHistory.value.push({ role: 'user', content: payload, timestamp })
            if (selectedChatId.value) {
                try {
                    await chatStore.saveMessage(selectedChatId.value, 'user', payload)
                } catch (e) { console.warn(e) }
            }

            // Show results immediately without blocking on analysis
            // Analysis is now on-demand via "Generate Insights" button
            const resultCount = Array.isArray(body.result) ? body.result.length : 1
            const quickSummary = `Query returned ${resultCount} result${resultCount !== 1 ? 's' : ''}.`

            chatHistory.value.push({
                role: 'assistant',
                content: quickSummary,
                timestamp: Date.now(),
                meta: {
                    hasResults: true,
                    query: payload,
                    resultPreview: Array.isArray(body.result) ? body.result.slice(0, 20) : body.result,
                    canGenerateInsights: true
                }
            })

            if (selectedChatId.value) {
                try {
                    await chatStore.saveMessage(selectedChatId.value, 'ai', quickSummary)
                } catch (e) { console.warn('Failed to persist message', e) }
            }

            resultsPanelVisible.value = true
        } catch (e: any) {
            if (e.name === 'AbortError') return
            const msg = e instanceof Error ? e.message : String(e)
            queryError.value = msg
            failOperation(opId, msg)
            toast.error('Query failed', { description: msg })
        } finally {
            isExecuting.value = false
            abortController.value = null
            currentOpId.value = ''
        }
    }

    const handleAIGenerate = async () => {
        if (!selectedConnection.value) {
            toast.error('Select connection')
            return
        }
        if (!chatInput.value.trim()) {
            toast.error('Enter prompt')
            return
        }

        if (!selectedChatId.value) {
            try {
                const newChat = await options.createChat('New Chat')
                // chats.value unshift? handled by createChat + watcher
                selectedChatId.value = newChat.id
                chatHistory.value = []
            } catch (e) {
                console.error('Auto-create chat failed', e)
            }
        }

        const userPrompt = chatInput.value.trim()
        chatInput.value = ''
        isExecuting.value = true

        const gid = `chat-${Date.now()}`

        // Follow-up Explanation Check - Route directly to analysis when user asks about previous results
        const isExplanationRequest = /\b(explain|how|why|elaborate|tell me more|what does|reasoning|clarify|break down)\b/i.test(userPrompt)
        const isReference = /\b(this|that|it|these|those|the result|results?|above|previous)\b/i.test(userPrompt)

        if (isExplanationRequest && isReference && queryResult.value && lastQuery.value) {
            console.log('[Chat] Detected follow-up explanation request, using previous results')
            chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() })

            try {
                const explanation = await analyzeResults(userPrompt, queryResult.value, lastQuery.value)
                const explanationText = typeof explanation === 'string' ? explanation : JSON.stringify(explanation)

                chatHistory.value.push({
                    role: 'assistant',
                    content: explanationText,
                    timestamp: Date.now()
                })

                if (selectedChatId.value) {
                    try {
                        await chatStore.saveMessage(selectedChatId.value, 'user', userPrompt)
                        await chatStore.saveMessage(selectedChatId.value, 'ai', explanationText)
                    } catch (e) { console.warn('Failed to persist messages', e) }
                }
            } catch (err: any) {
                console.error('[Chat] Follow-up explanation failed:', err)
                chatHistory.value.push({
                    role: 'assistant',
                    content: 'I apologize, I was unable to provide an explanation. Please try rephrasing your question.',
                    timestamp: Date.now()
                })
            }

            isExecuting.value = false
            return
        }

        // Visualization Check
        const wantsVisualization = /visualize|chart|graph|dashboard/i.test(userPrompt)
        if (wantsVisualization && isReference && queryResult.value && lastQuery.value) {
            chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() })
            chatHistory.value.push({ role: 'assistant', content: 'Generating visualization...', timestamp: Date.now() })
            await handleCreateDashboardElement(gid)
            isExecuting.value = false
            return
        }

        // Standard AI Flow
        await withProgress('AI Query', async (update: any) => {
            update(10, 'Thinking...')

            const history = chatHistory.value || []
            let activeTable = undefined
            const activeTab = workspaceStore.activeTab as any
            const tabValue = activeTab && (activeTab.value || activeTab)
            if (tabValue?.type === 'table') activeTable = tabValue.data?.tableName
            else if (tabValue?.type === 'spreadsheet') activeTable = tabValue.data?.tableName

            // Validate connection ID before making request
            const connectionId = selectedConnection.value?.id
            console.log('[Chat] AI Request:', {
                connectionId,
                provider: selectedConnection.value?.provider,
                name: selectedConnection.value?.name || selectedConnection.value?.label,
                activeTable,
                activeTabType: tabValue?.type,
                activeTabData: tabValue?.data
            })

            if (!connectionId) {
                console.error('[Chat] No valid connection ID found:', selectedConnection.value)
                toast.error('Connection error', {
                    description: 'Please select a valid database connection before using AI.'
                })
                isExecuting.value = false
                return
            }

            let aiResponse: any = null;

            const requestBody: any = {
                prompt: userPrompt,
                connectionId,
                context: history,
                activeTable,
                ...options.aiOptions.value
            };

            currentExecutionSteps.value = [];

            await api.stream<any>('/ai/generate', requestBody, (chunk) => {
                if (chunk.type === 'progress') {
                    update(chunk.progress, chunk.message)
                    currentExecutionSteps.value.push({ message: chunk.message, timestamp: Date.now(), progress: chunk.progress })
                } else if (chunk.error) {
                    throw new Error(chunk.error)
                } else {
                    // This is the final result (or part of it)
                    aiResponse = chunk
                }
            }, {
                signal: abortController.value?.signal
            })

            if (!aiResponse) throw new Error("No response from AI")

            // Handle generated table tool response
            if ((aiResponse as any).type === 'generated_table' && options.onAIResponse) {
                options.onAIResponse(aiResponse)
                isExecuting.value = false
                return
            }

            // Handle INTENT-BASED architecture responses
            if ((aiResponse as any).type === 'data_response' || (aiResponse as any).type === 'visualization_request') {
                const response = aiResponse as any;

                // Handle COMPOUND response (array of results)
                if (response.isCompound && Array.isArray(response.results)) {
                    // Iterate and display each result
                    // For UI simplicity, we'll set the LAST result as the "main" one for the preview panel
                    // But we'll push multiple history items so the user sees all of them in the chat stream.

                    response.results.forEach((res: any, index: number) => {
                        const title = res.intent?.visualization?.title || (index === 0 ? "First Result" : "Next Result");

                        // Push to history
                        chatHistory.value.push({
                            role: 'assistant',
                            content: `**${title}**:`,
                            timestamp: Date.now(),
                            meta: { hasResults: true, query: res.query, resultPreview: Array.isArray(res.data) ? res.data.slice(0, 5) : res.data }
                        });

                        // If it's the last one, open the panel
                        if (index === response.results.length - 1) {
                            queryResult.value = res.data;
                            lastQuery.value = res.query;
                            resultsPanelVisible.value = true;
                        }
                    });

                    isExecuting.value = false;
                    return;
                }


                // 1. Capture the query for display/history
                lastQuery.value = response.query;

                // 2. Capture the data directly (No extra roundtrip!)
                queryResult.value = response.data;

                // 4. Handle Visualizations or Standard Data
                if (response.type === 'visualization_request') {
                    // ... existing visualization logic ...
                    const aiConfig = response.config;
                    suggestedChartType.value = aiConfig.type;

                    const { generateChartConfig } = await import('@/lib/chartGenerator');
                    const dataArray = Array.isArray(response.data) ? response.data : [response.data];

                    let finalConfig = generateChartConfig(dataArray, lastQuery.value);
                    if (finalConfig) {
                        if (aiConfig.type) finalConfig.type = aiConfig.type as any;
                        if (aiConfig.title) finalConfig.title = aiConfig.title;
                    }
                    if (!finalConfig) {
                        finalConfig = {
                            type: aiConfig.type || 'bar',
                            title: aiConfig.title || 'Visualization',
                            config: { data: { labels: [], datasets: [] } }
                        }
                    }

                    dashboardPreviewConfig.value = finalConfig;
                    dashboardPreviewVisible.value = true;

                    chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() });
                    chatHistory.value.push({
                        role: 'assistant',
                        content: response.message || `I've generated a ${aiConfig.type} chart based on your request.`,
                        timestamp: Date.now(),
                        meta: { hasResults: true, query: response.query }
                    });
                } else {
                    // Standard Data Response
                    chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() });

                    // Use the AI's explanation if available (Analyst Loop), otherwise generic text
                    const content = response.message || `Here is the data you requested.`;

                    // 2-Step Visualization: Check for blueprint from analysis
                    if (response.vizBlueprint) {
                        const aiConfig = response.vizBlueprint;
                        suggestedChartType.value = aiConfig.type;

                        const { generateChartConfig } = await import('@/lib/chartGenerator');
                        const dataArray = Array.isArray(response.data) ? response.data : [response.data];

                        let finalConfig = generateChartConfig(dataArray, lastQuery.value);
                        if (finalConfig) {
                            if (aiConfig.type) finalConfig.type = aiConfig.type as any;
                            if (aiConfig.title) finalConfig.title = aiConfig.title;

                            // Apply axis mapping suggestions if provided
                            if (aiConfig.xAxis && finalConfig.config) {
                                finalConfig.config.xAxis = aiConfig.xAxis;
                            }
                            if (aiConfig.yAxis && finalConfig.config) {
                                finalConfig.config.yAxis = Array.isArray(aiConfig.yAxis) ? aiConfig.yAxis : [aiConfig.yAxis];
                            }
                        }

                        if (finalConfig) {
                            dashboardPreviewConfig.value = finalConfig;
                            dashboardPreviewVisible.value = true;
                            console.log('[useChatExecution] Auto-visualizing via blueprint:', finalConfig);
                        }
                    }

                    chatHistory.value.push({
                        role: 'assistant',
                        content: content,
                        timestamp: Date.now(),
                        meta: {
                            hasResults: true,
                            query: response.query,
                            vizBlueprint: response.vizBlueprint
                        }
                    });
                }

                isExecuting.value = false;
                return;
            }

            // Legacy/Fallback for text-only responses
            update(40, 'Executing...')

            // Multi-step logic from Chat.vue
            if (aiResponse.multi_step && Array.isArray(aiResponse.steps)) {
                // ... implementation mirrors Chat.vue ...
                const combinedResults: any[] = []
                let combinedQuery = ''
                let visualizableResults: any[] = []
                let localSuggestedChartType: string | null = null

                for (const step of aiResponse.steps) {
                    const normalizedStepQuery = normalizeQuery(step.query, selectedConnection.value.provider)
                    combinedQuery += normalizedStepQuery + (normalizedStepQuery.endsWith(';') ? '\n' : ';\n')
                    if (step.result) {
                        combinedResults.push({ explanation: step.explanation, result: step.result })
                        if (step.visualizable) {
                            if (Array.isArray(step.result)) visualizableResults.push(...step.result)
                            else visualizableResults.push(step.result)
                            if (step.chart_type) localSuggestedChartType = step.chart_type
                        }
                    } else if (step.error) {
                        combinedResults.push({ explanation: step.explanation, error: step.error })
                    }
                }

                queryResult.value = combinedResults
                lastQuery.value = combinedQuery

                if (visualizableResults.length > 0) {
                    visualizableResult.value = visualizableResults
                    suggestedChartType.value = localSuggestedChartType
                }

                // Quick summary without blocking on AI analysis
                update(80, 'Done')
                const stepCount = aiResponse.steps.length
                const aiSummary = `Executed ${stepCount} step${stepCount !== 1 ? 's' : ''}. Here are the results.`

                // Update history
                chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() })
                if (selectedChatId.value) {
                    try {
                        await chatStore.saveMessage(selectedChatId.value, 'user', userPrompt)
                    } catch (e) { console.warn(e) }
                }

                chatHistory.value.push({
                    role: 'assistant',
                    content: aiSummary,
                    timestamp: Date.now(),
                    meta: { is_multi_step: true, steps: combinedResults }
                })
                if (selectedChatId.value) {
                    try {
                        await chatStore.saveMessage(selectedChatId.value, 'ai', aiSummary)
                    } catch (e) { console.warn(e) }
                }

            } else {
                // Single step standard
                const singleAIResponse = aiResponse as any

                // If this is a mutation (edit/insert/delete)
                if (singleAIResponse.action === 'edit') {
                    openMutation(singleAIResponse)
                    isExecuting.value = false
                    // We don't push to history yet - wait for user to apply
                    return
                }

                // Executing the query in aiResponse
                if (!singleAIResponse.query || !singleAIResponse.query.trim()) {
                    console.warn('[Chat] No query generated by AI')
                    chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() })
                    const fallbackContent = singleAIResponse.text || singleAIResponse.explanation || "I'm sorry, I couldn't generate a valid query for that request."
                    chatHistory.value.push({
                        role: 'assistant',
                        content: fallbackContent,
                        timestamp: Date.now()
                    })
                    if (selectedChatId.value) {
                        try {
                            await chatStore.saveMessage(selectedChatId.value, 'user', userPrompt)
                            await chatStore.saveMessage(selectedChatId.value, 'ai', fallbackContent)
                        } catch (e) { console.warn(e) }
                    }
                    isExecuting.value = false
                    return
                }

                const body = await api.post<any>('/query', {
                    provider: selectedConnection.value.provider,
                    connection: buildConnectionPayload(selectedConnection.value),
                    query: normalizeQuery(singleAIResponse.query, selectedConnection.value.provider),
                    source: 'ai',
                    model: singleAIResponse.model
                })

                queryResult.value = body.result
                lastQuery.value = singleAIResponse.query
                // Generate Natural Summary
                update(90, 'Synthesizing...')
                let aiSummary = singleAIResponse.explanation || "Query executed successfully."
                let prediction = null
                try {
                    const response = await analyzeResults(userPrompt, body.result, singleAIResponse.query)
                    if (response) {
                        if (typeof response === 'object') {
                            aiSummary = response.answer
                            prediction = response.prediction
                        } else {
                            // Try parsing if it's a stringified JSON (from backend)
                            try {
                                const parsed = JSON.parse(response)
                                if (parsed.answer) {
                                    aiSummary = parsed.answer
                                    prediction = parsed.prediction
                                } else {
                                    aiSummary = response
                                }
                            } catch (e) {
                                aiSummary = response
                            }
                        }
                    }
                } catch (err: any) {
                    console.error('[Chat] Failed to generate single-step summary:', err)
                }

                chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() })
                if (selectedChatId.value) {
                    try {
                        await chatStore.saveMessage(selectedChatId.value, 'user', userPrompt)
                    } catch (e) { console.warn(e) }
                }

                const assistantContent = typeof aiSummary === 'object' ? JSON.stringify(aiSummary) : aiSummary

                const meta = {
                    ...(prediction ? { prediction } : {}),
                    contextUsed: (singleAIResponse as any).contextUsed,
                    steps: currentExecutionSteps.value
                }

                chatHistory.value.push({
                    role: 'assistant',
                    content: assistantContent,
                    timestamp: Date.now(),
                    meta
                })
                if (selectedChatId.value) {
                    try {
                        await chatStore.saveMessage(selectedChatId.value, 'ai', assistantContent, meta)
                    } catch (e) { console.warn(e) }
                }
            }

        }, { category: 'ai', groupId: gid })

        isExecuting.value = false
    }

    return {
        isExecuting,
        queryResult,
        queryError,
        lastQuery,
        currentOpId,
        run,
        stopExecution,
        handleAIGenerate,
        handleCreateDashboardElement,
        currentExecutionSteps
    }
}
