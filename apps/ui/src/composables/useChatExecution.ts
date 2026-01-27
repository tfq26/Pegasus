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
        lastQuery.value = payload

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

        // Standard AI Flow (Streaming)
        await withProgress('AI Query', async (update: any) => {
            update(10, 'Thinking...')

            const history = [...(chatHistory.value || [])]
            let activeTable = undefined
            const activeTab = workspaceStore.activeTab as any
            const tabValue = activeTab && (activeTab.value || activeTab)
            if (tabValue?.type === 'table') activeTable = tabValue.data?.tableName
            else if (tabValue?.type === 'spreadsheet') activeTable = tabValue.data?.tableName

            const connectionId = selectedConnection.value?.id
            if (!connectionId) {
                toast.error('Connection error', { description: 'Please select a valid database connection.' })
                isExecuting.value = false
                return
            }

            // Add user message to history
            const userMsg = { role: 'user', content: userPrompt, timestamp: Date.now() }
            chatHistory.value.push(userMsg)
            if (selectedChatId.value) {
                try { await chatStore.saveMessage(selectedChatId.value, 'user', userPrompt) } catch (e) { }
            }

            // Create placeholder for assistant message
            const assistantMsgIndex = chatHistory.value.length
            chatHistory.value.push({
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                meta: { isStreaming: true }
            })

            try {
                const { generateAIQueryStream } = await import('@/lib/api')

                await generateAIQueryStream(userPrompt, connectionId, history, activeTable, {
                    model: options.aiOptions.value?.model,
                    temperature: options.aiOptions.value?.temperature,
                    onChunk: (chunk) => {
                        update(40, 'Generating...')
                        chatHistory.value[assistantMsgIndex].content += chunk
                    },
                    onToolCall: (toolCalls) => {
                        console.log('[Stream] Tool Calls:', toolCalls)
                    },
                    onToolResult: (result) => {
                        console.log('[Stream] Tool Result:', result)

                        // Handle data response from query_data tool
                        if (result.type === 'data_response') {
                            queryResult.value = result.data;
                            lastQuery.value = result.query || 'SQL Query';
                            chatHistory.value[assistantMsgIndex].meta = {
                                ...chatHistory.value[assistantMsgIndex].meta,
                                hasResults: true,
                                query: result.query,
                                resultPreview: Array.isArray(result.data) ? result.data.slice(0, 5) : []
                            }
                        }
                        // Handle query result from execute_query tool
                        else if (result.type === 'query_result') {
                            queryResult.value = result.rows;
                            lastQuery.value = result.query || 'SQL Query';
                            chatHistory.value[assistantMsgIndex].meta = {
                                ...chatHistory.value[assistantMsgIndex].meta,
                                hasResults: true,
                                query: result.query,
                                resultPreview: Array.isArray(result.rows) ? result.rows.slice(0, 5) : []
                            }
                        }
                        // Handle table generation request
                        else if (result.type === 'generate_table_request') {
                            chatHistory.value[assistantMsgIndex].content += `\n\n*Generating table: ${result.tableName}...*`;
                            // This would typically involve calling another service or emitting an event
                            // For now, we signal that results are coming
                            chatHistory.value[assistantMsgIndex].meta = {
                                ...chatHistory.value[assistantMsgIndex].meta,
                                toolAction: 'generate_table',
                                toolParams: result
                            }
                        }
                    },
                    onDone: async (usage) => {
                        update(100, 'Done')
                        const meta = chatHistory.value[assistantMsgIndex].meta;
                        if (meta) {
                            meta.isStreaming = false;
                            meta.usage = usage;
                            meta.canGenerateInsights = meta.hasResults;
                        }

                        if (selectedChatId.value) {
                            try {
                                await chatStore.saveMessage(
                                    selectedChatId.value,
                                    'ai',
                                    chatHistory.value[assistantMsgIndex].content,
                                    chatHistory.value[assistantMsgIndex].meta
                                )
                            } catch (e) { }
                        }
                    }
                })
            } catch (err: any) {
                console.error('[Chat] Streaming failed:', err)
                chatHistory.value[assistantMsgIndex].content = `I encountered an error: ${err.message}`
                if (chatHistory.value[assistantMsgIndex].meta) {
                    chatHistory.value[assistantMsgIndex].meta.isStreaming = false
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
