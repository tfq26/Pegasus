export class SearchService {
    /**
     * Perform a web search using the best available provider.
     * Order: Tavily -> You.com -> Serper -> Mock
     * @param {string} query - The search query
     * @returns {Promise<Array>} - Array of search results
     */
    static async search(query) {
        console.log(`[SearchService] Searching for: ${query}`);

        // 1. Check Tavily (Best for LLMs)
        const tavilyKey = process.env.TAVILY_API_KEY;
        if (tavilyKey) {
            try {
                const results = await this._searchTavily(query, tavilyKey);
                if (results && results.length > 0) return results;
            } catch (e) {
                console.warn("[SearchService] Tavily search failed, falling back:", e.message);
            }
        }

        // 2. Check You.com (Great snippets/RAG)
        const youKey = process.env.YOUDOTCOM_API_KEY;
        if (youKey) {
            try {
                const results = await this._searchYou(query, youKey);
                if (results && results.length > 0) return results;
            } catch (e) {
                console.warn("[SearchService] You.com search failed, falling back:", e.message);
            }
        }

        // 3. Check Serper (Google mirror)
        const serperKey = process.env.SERPER_API_KEY;
        if (serperKey) {
            try {
                const results = await this._searchSerper(query, serperKey);
                if (results && results.length > 0) return results;
            } catch (e) {
                console.warn("[SearchService] Serper search failed, falling back:", e.message);
            }
        }

        // Fallback: Simulated results if no key is missing or all providers failed
        console.warn("[SearchService] No active search provider configured. Returning simulated results.");
        return [
            {
                title: `Search result for: ${query}`,
                snippet: `This is a simulated search result for "${query}". To enable real web search, please configure TAVILY_API_KEY, YOUDOTCOM_API_KEY, or SERPER_API_KEY in your .env file.`,
                link: "https://pegasus-ai.example.com/search-mock"
            }
        ];
    }

    static async _searchTavily(query, apiKey) {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                search_depth: "basic",
                max_results: 5
            })
        });

        if (!response.ok) throw new Error(`Tavily error: ${response.statusText}`);
        const data = await response.json();
        return (data.results || []).map(r => ({
            title: r.title,
            snippet: r.content || r.snippet,
            link: r.url
        }));
    }

    static async _searchYou(query, apiKey) {
        const url = `https://api.ydc-index.io/search?query=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error(`You.com error: ${response.statusText}`);
        const data = await response.json();
        const hits = data.hits || [];

        return hits.map(hit => ({
            title: hit.title,
            snippet: (hit.snippets || []).join(' ') || hit.description,
            link: hit.url
        })).slice(0, 5);
    }

    static async _searchSerper(query, apiKey) {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: query })
        });

        if (!response.ok) throw new Error(`Serper error: ${response.statusText}`);
        const data = await response.json();
        return (data.organic || []).map(res => ({
            title: res.title,
            snippet: res.snippet || res.content,
            link: res.link
        })).slice(0, 5);
    }
}
