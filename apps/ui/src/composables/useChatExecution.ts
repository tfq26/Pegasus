import { ref, type Ref, nextTick } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatStore } from '@/stores/chat'
// useChat removed to avoid circular dependency
// Chat.vue provides createChat

import { toast } from 'vue-sonner'
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
        createChat: (title?: string) => Promise<any> // Callback to avoid circular dependency
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

    // --- Helpers ---
    const normalizeQuery = (query: string, provider: string) => {
        if (!query) return ''
        let trimmed = query.trim()

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
            if ((window as any).__visualizableResult) {
                dataForVisualization = (window as any).__visualizableResult
                delete (window as any).__visualizableResult
                delete (window as any).__suggestedChartType
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
            // Get content from active query tab via workspace store directly? 
            // Chat.vue used workspaceRef which is UI specific.
            // We can check workspaceStore.activeTab.
            const activeTab = (workspaceStore as any).activeTab
            if (activeTab?.type === 'query') {
                activeInput = activeTab.data?.content || writeInput.value
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
        lastQuery.value = payload

        if (abortController.value) abortController.value.abort()
        abortController.value = new AbortController()

        const opId = `query-exec-${Date.now()}`
        currentOpId.value = opId
        startOperation(opId, `Executing Query`, { cancellable: true, onCancel: handleCancelQuery })

        try {
            // Note: access api url via import.meta.env or config
            // Ideally pass api client or config. 
            // Assuming direct fetch for now matching Chat.vue
            // We need QUERY_API_URL.
            const queryApiUrl = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'

            const response = await fetch(`${queryApiUrl}/query`, {
                signal: abortController.value.signal,
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    provider: selectedConnection.value.provider,
                    connection: buildConnectionPayload(selectedConnection.value),
                    query: normalizeQuery(payload, selectedConnection.value.provider),
                    source: 'user',
                    model: null
                })
            })

            const body = await response.json()
            if (!response.ok || body.error) throw new Error(body.error ?? 'Execution failed')

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

            // Generate AI Summary for Chat Mode
            if (mode.value === 'chat') {
                try {
                    const aiSummary = await analyzeResults(payload, body.result, payload)
                    const summaryText = typeof aiSummary === 'string' ? aiSummary : (JSON.stringify(aiSummary) || 'Query executed successfully.')

                    chatHistory.value.push({
                        role: 'assistant',
                        content: summaryText,
                        timestamp: Date.now()
                    })

                    if (selectedChatId.value) {
                        try {
                            await chatStore.saveMessage(selectedChatId.value, 'ai', summaryText)
                        } catch (e) { console.warn('Failed to persist message', e) }
                    }
                } catch (err: any) {
                    console.error('[Chat] Failed to generate summary:', err)
                    const fallback = 'Query completed.'
                    chatHistory.value.push({ role: 'assistant', content: fallback, timestamp: Date.now() })
                    if (selectedChatId.value) {
                        try {
                            await chatStore.saveMessage(selectedChatId.value, 'ai', fallback)
                        } catch (e) { console.warn(e) }
                    }
                }
            } else {
                chatHistory.value.push({ role: 'system', content: JSON.stringify(body.result), timestamp })
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
        resultsPanelVisible.value = true
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
            // Need active table from workspace... 
            const activeTab = (workspaceStore as any).activeTab
            if (activeTab?.type === 'table') activeTable = activeTab.data?.tableName

            const aiResponse = await generateAIQuery(userPrompt, selectedConnection.value.id, history, activeTable)
            update(40, 'Executing...')

            // Multi-step logic from Chat.vue
            if (aiResponse.multi_step && Array.isArray(aiResponse.steps)) {
                // ... implementation mirrors Chat.vue ...
                // For brevity in first pass, implementing the steps aggregation logic
                const combinedResults: any[] = []
                let combinedQuery = ''
                let visualizableResults: any[] = []
                let suggestedChartType: string | null = null

                for (const step of aiResponse.steps) {
                    const normalizedStepQuery = normalizeQuery(step.query, selectedConnection.value.provider)
                    combinedQuery += normalizedStepQuery + (normalizedStepQuery.endsWith(';') ? '\n' : ';\n')
                    if (step.result) {
                        combinedResults.push({ explanation: step.explanation, result: step.result })
                        if (step.visualizable) {
                            if (Array.isArray(step.result)) visualizableResults.push(...step.result)
                            else visualizableResults.push(step.result)
                            if (step.chart_type) suggestedChartType = step.chart_type
                        }
                    } else if (step.error) {
                        combinedResults.push({ explanation: step.explanation, error: step.error })
                    }
                }

                queryResult.value = combinedResults
                lastQuery.value = combinedQuery

                if (visualizableResults.length > 0) {
                    (window as any).__visualizableResult = visualizableResults;
                    (window as any).__suggestedChartType = suggestedChartType;
                }

                // Summary
                update(80, 'Summarizing...')
                let aiSummary = ""
                try {
                    aiSummary = await analyzeResults(userPrompt, combinedResults, combinedQuery)
                } catch (err: any) {
                    console.error('[Chat] Failed to generate multi-step summary:', err)
                    aiSummary = "Here are the results of your request."
                }

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
                const payload = buildConnectionPayload(selectedConnection.value)
                const res = await fetch(`${import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'}/query`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        provider: selectedConnection.value.provider,
                        connection: payload,
                        query: normalizeQuery(singleAIResponse.query, selectedConnection.value.provider),
                        source: 'ai',
                        model: singleAIResponse.model
                    })
                })
                const body = await res.json()
                if (!res.ok) throw new Error(body.error)

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
                chatHistory.value.push({
                    role: 'assistant',
                    content: assistantContent,
                    timestamp: Date.now(),
                    meta: prediction ? { prediction } : undefined
                })
                if (selectedChatId.value) {
                    try {
                        await chatStore.saveMessage(selectedChatId.value, 'ai', assistantContent, prediction ? { prediction } : undefined)
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
        handleCreateDashboardElement
    }
}
