import { createSignal, For, Show } from 'solid-js';
import { Search, FileUp, Cpu, Database, FileText, ChevronRight } from 'lucide-solid';

function App() {
  const [question, setQuestion] = createSignal("");
  const [isProcessing, setIsProcessing] = createSignal(false);
  const [steps, setSteps] = createSignal([]);
  const [results, setResults] = createSignal(null);
  const [resultStatus, setResultStatus] = createSignal("idle");
  const [query, setQuery] = createSignal("");

  const [activeFile, setActiveFile] = createSignal(null);
  const [processingTrace, setProcessingTrace] = createSignal([]);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      console.log("File selected:", file.name);
      setActiveFile(file);
      setResultStatus("File Loaded");
    }
  };

  const parseResponse = (text, trace = []) => {
    const tags = ["interpretation", "schema_analysis", "query_generation", "synthesis"];
    const parsedSteps = tags.map(tag => {
      const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const match = text.match(regex);
      let content = match ? match[1].trim() : "Step skipped by AI.";

      // Enrich schema analysis with internal processing trace
      if (tag === 'schema_analysis' && trace.length > 0) {
        content = `${content}\n\n[PROD ENGINE LOGS]:\n${trace.map(t => `> ${t.message}`).join('\n')}`;
      }

      return {
        title: tag.replace('_', ' ').toUpperCase(),
        status: "complete",
        content: content
      };
    });
    setSteps(parsedSteps);

    // Extract query for execution
    const queryMatch = text.match(/<query_generation>([\s\S]*?)<\/query_generation>/i);
    if (queryMatch) {
      setQuery(queryMatch[1].trim());
      // For now we still show mock data or could call another backend endpoint
      setResults([
        { id: 1, category: "Engineering", amount: 1200, status: "Active" },
        { id: 2, category: "Marketing", amount: 800, status: "Pending" },
        { id: 3, category: "Sales", amount: 2500, status: "Complete" },
      ]);
      setResultStatus("Complete");
    }
  };

  const runAnalysis = async () => {
    if (!question()) return;
    if (!activeFile()) {
        alert("Please upload a source file first.");
        return;
    }

    setIsProcessing(true);
    setSteps([
      { title: "INITIALIZING", status: "processing", content: "Establishing data context connection to production backend..." },
    ]);

    try {
        const formData = new FormData();
        formData.append('file', activeFile());
        formData.append('question', question());

        const response = await fetch('/api/inspector/analyze', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error("Backend analysis failed");

        const data = await response.json();
        console.log("[App] Received analysis data:", data);
        setProcessingTrace(data.trace || []);
        parseResponse(data.fullTaggedResponse || data.rawResponse, data.trace);
        
        // Show actual schema sample if available
        if (data.context && data.context.semanticContext?.samples) {
            const firstTable = Object.keys(data.context.semanticContext.samples)[0];
            if (firstTable) {
                setResults(data.context.semanticContext.samples[firstTable]);
            }
        }

    } catch (err) {
        console.error("Analysis Error:", err);
        setSteps([{ title: "ERROR", status: "error", content: err.message }]);
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div class="min-h-screen bg-background text-white p-8 font-sans">
      <header class="max-w-5xl mx-auto mb-12 flex justify-between items-center">
        <div>
          <h1 class="text-4xl font-black tracking-tighter text-neonCyan animate-pulse-cyan">AI INSPECTOR</h1>
          <p class="text-gray-500 uppercase tracking-widest text-xs mt-1">Extreme Transparency Analysis Engine</p>
        </div>
        <div class="flex items-center gap-4">
          <Show when={activeFile()}>
            <div class="flex items-center gap-2 px-3 py-1 bg-neonCyan/10 border border-neonCyan/50 rounded text-neonCyan text-[10px] font-bold animate-in fade-in slide-in-from-right-4 duration-500">
              <Database size={12} />
              SOURCE READY: {activeFile().name}
            </div>
          </Show>
          <label class="px-4 py-2 border border-neonCyan/30 rounded-full cursor-pointer hover:bg-neonCyan/5 transition-all text-sm flex items-center gap-2">
            <FileUp size={16} />
            {activeFile() ? 'CHANGE SOURCE' : 'UPLOAD SOURCE'}
            <input type="file" class="hidden" onChange={handleUpload} />
          </label>
        </div>
      </header>

      <main class="max-w-5xl mx-auto">
        <section class="mb-8 relative">
          <input
            type="text"
            value={question()}
            onInput={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your data..."
            class="w-full bg-darkGray border-b-2 border-neonPurple/50 p-6 text-xl focus:outline-none focus:border-neonPurple transition-all placeholder:text-gray-700"
          />
          <button
            onClick={runAnalysis}
            class="absolute right-4 top-1/2 -translate-y-1/2 bg-neonPurple text-black font-bold px-6 py-2 rounded-md hover:bg-white transition-all flex items-center gap-2"
          >
            ANALYZE <ChevronRight size={18} />
          </button>
        </section>

        <section class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-6">
            <h2 class="text-xs font-bold text-gray-500 tracking-[0.2em] mb-4 flex items-center gap-2">
              <Cpu size={14} /> THINKING PIPELINE
            </h2>
            
            <For many={steps()}>
              {(step) => (
                <div class="neon-border glass p-6 rounded-lg relative overflow-hidden group">
                  <div class={`absolute left-0 top-0 bottom-0 w-1 ${step.status === 'complete' ? 'bg-neonCyan' : 'bg-neonPurple animate-pulse'}`}></div>
                  <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg uppercase tracking-tight">{step.title}</h3>
                    <span class={`text-[10px] px-2 py-0.5 rounded border ${step.status === 'complete' ? 'border-neonCyan text-neonCyan' : 'border-neonPurple text-neonPurple'}`}>
                      {step.status.toUpperCase()}
                    </span>
                  </div>
                  <p class="text-gray-400 font-mono text-sm leading-relaxed">
                    {step.content}
                  </p>
                </div>
              )}
            </For>
            
            <Show when={steps().length === 0}>
              <div class="h-64 border-2 border-dashed border-gray-800 rounded-lg flex flex-col items-center justify-center text-gray-600">
                <Search size={48} class="mb-4 opacity-20" />
                <p>Waiting for query initiation...</p>
              </div>
            </Show>
          </div>

          <div class="space-y-6">
            <h2 class="text-xs font-bold text-gray-500 tracking-[0.2em] mb-4 flex items-center gap-2">
              <Database size={14} /> LIVE RESULTS
            </h2>
            <div class="neon-border-purple glass p-4 rounded-lg min-h-[300px] overflow-auto">
              <Show when={results()} fallback={
                <div class="text-gray-600 text-sm font-mono italic">
                  {resultStatus() === 'idle' ? 'No active data context.' : 'Executing query...'}
                </div>
              }>
                <table class="w-full text-xs font-mono text-left">
                  <thead>
                    <tr class="border-b border-white/10 text-gray-400">
                      <For many={Object.keys(results()[0])}>
                        {(key) => <th class="p-2 uppercase">{key}</th>}
                      </For>
                    </tr>
                  </thead>
                  <tbody>
                    <For many={results()}>
                      {(row) => (
                        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <For many={Object.values(row)}>
                            {(val) => <td class="p-2 truncate max-w-[100px]">{val}</td>}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            </div>

            <h2 class="text-xs font-bold text-gray-500 tracking-[0.2em] mb-4 flex items-center gap-2">
              <FileText size={14} /> SYNTHESIS
            </h2>
            <div class={`neon-border glass p-6 rounded-lg min-h-[150px] transition-all ${steps().length > 3 ? 'border-neonCyan' : ''}`}>
               <Show when={steps().find(s => s.title === 'SYNTHESIS')} fallback={
                 <div class="text-gray-600 text-sm font-mono italic">
                  Synthesis awaiting query completion.
                </div>
               }>
                 <p class="text-gray-200 leading-relaxed italic">
                   "{steps().find(s => s.title === 'SYNTHESIS').content}"
                 </p>
               </Show>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
