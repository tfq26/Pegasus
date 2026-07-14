const sourceCatalog = [
  { id: "src_portfolio_xlsx", type: "file", label: "PortfolioGain-LossReport45ce8911.xlsx", value: "PortfolioGain-LossReport45ce8911.xlsx" },
  { id: "src_sales_table", type: "table", label: "sales_current_qtr", value: "sales_current_qtr" },
  { id: "src_market_pdf", type: "file", label: "market-expansion-packet.pdf", value: "market-expansion-packet.pdf" },
  { id: "src_client_notes", type: "note", label: "client_strategy_notes", value: "client_strategy_notes" },
  { id: "src_customer_db", type: "database", label: "customer_profile_db", value: "customer_profile_db" }
];

const state = {
  selectedSources: [],
  replyToMessageId: null,
  messages: [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Welcome back. Add one or more source references with ! and ask a grounded question.",
      createdAt: new Date().toISOString()
    }
  ]
};

const threadEl = document.getElementById("thread");
const selectedSourceRowEl = document.getElementById("selectedSourceRow");
const promptEl = document.getElementById("prompt");
const mentionSuggestionsEl = document.getElementById("mentionSuggestions");
const resultEl = document.getElementById("result");
const sendBtn = document.getElementById("send");
const apiBaseUrl = window.PEGASUS_RUNTIME?.apiBaseUrl || (window.location.origin.includes('5173') || window.location.origin.includes('1420') ? "http://127.0.0.1:3000/api/microservices" : `${window.location.origin}/api/microservices`);

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderThread() {
  threadEl.innerHTML = "";
  state.messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = `message ${message.role}`;
    item.innerHTML = `
      <div class="meta">${message.role === "user" ? "You" : "Pegasus"} · ${new Date(message.createdAt).toLocaleTimeString()}</div>
      <div class="content">${escapeHtml(message.content)}</div>
      <div class="actions">
        <button class="chip-btn reply-btn" data-id="${message.id}">Reply</button>
      </div>
    `;
    threadEl.appendChild(item);
  });
  threadEl.scrollTop = threadEl.scrollHeight;

  threadEl.querySelectorAll(".reply-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sourceMessage = state.messages.find((m) => m.id === btn.dataset.id);
      if (!sourceMessage) return;
      state.replyToMessageId = sourceMessage.id;
      const preview = sourceMessage.content.slice(0, 120);
      promptEl.value = `Replying to: "${preview}"\n`;
      promptEl.focus();
      promptEl.selectionStart = promptEl.selectionEnd = promptEl.value.length;
    });
  });
}

function renderSelectedSources() {
  selectedSourceRowEl.innerHTML = "";
  state.selectedSources.forEach((source) => {
    const pill = document.createElement("span");
    pill.className = "source-pill";
    pill.innerHTML = `
      <span>${source.label}</span>
      <span class="remove" data-id="${source.id}">x</span>
    `;
    selectedSourceRowEl.appendChild(pill);
  });

  selectedSourceRowEl.querySelectorAll(".remove").forEach((removeEl) => {
    removeEl.addEventListener("click", () => {
      state.selectedSources = state.selectedSources.filter((s) => s.id !== removeEl.dataset.id);
      renderSelectedSources();
    });
  });
}

function normalizePromptForDisplay(prompt) {
  return prompt.replace(/!([A-Za-z0-9._-]+)/g, (_m, slug) => slug);
}

function upsertSelectedSource(source) {
  if (state.selectedSources.some((s) => s.id === source.id)) return;
  state.selectedSources.push(source);
  renderSelectedSources();
}

function showMentionSuggestions(query = "") {
  const normalized = query.trim().toLowerCase();
  const filtered = sourceCatalog.filter((source) =>
    !normalized || source.label.toLowerCase().includes(normalized) || source.id.toLowerCase().includes(normalized)
  );

  if (!filtered.length) {
    mentionSuggestionsEl.classList.add("hidden");
    mentionSuggestionsEl.innerHTML = "";
    return;
  }

  mentionSuggestionsEl.innerHTML = "";
  filtered.forEach((source) => {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = `${source.label} (${source.type})`;
    option.addEventListener("click", () => {
      upsertSelectedSource(source);
      promptEl.value = promptEl.value.replace(/![A-Za-z0-9._-]*$/, "") + " ";
      mentionSuggestionsEl.classList.add("hidden");
      promptEl.focus();
    });
    mentionSuggestionsEl.appendChild(option);
  });

  mentionSuggestionsEl.classList.remove("hidden");
}

function parseSourceMentionCandidate(text) {
  const match = text.match(/!([A-Za-z0-9._-]*)$/);
  if (!match) return null;
  return match[1] || "";
}

async function sendPrompt() {
  const prompt = promptEl.value.trim();
  if (!prompt) return;

  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: normalizePromptForDisplay(prompt),
    createdAt: new Date().toISOString()
  };
  state.messages.push(userMessage);
  renderThread();

  const payload = {
    envelope: {
      version: "1.0",
      mode: "grounded_chat",
      prompt,
      selected_sources: state.selectedSources,
      reply_to: state.replyToMessageId
        ? { message_id: state.replyToMessageId }
        : null,
      conversation: {
        last_user_message_id: userMessage.id
      },
      context: {
        source_selection_policy: "explicit_first"
      }
    },
    // Legacy compatibility for current server fallbacks
    prompt,
    selected_sources: state.selectedSources
  };

  promptEl.value = "";
  state.replyToMessageId = null;
  mentionSuggestionsEl.classList.add("hidden");

  try {
    const response = await fetch(`${apiBaseUrl}/v1/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await response.json();

    const assistant = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: json.answer || "No answer returned.",
      createdAt: new Date().toISOString()
    };
    state.messages.push(assistant);
    renderThread();

    resultEl.textContent = JSON.stringify(json, null, 2);
    resultEl.classList.remove("hidden");
  } catch (error) {
    const assistant = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `Request failed: ${error.message}`,
      createdAt: new Date().toISOString()
    };
    state.messages.push(assistant);
    renderThread();
  }
}

promptEl.addEventListener("input", () => {
  const mention = parseSourceMentionCandidate(promptEl.value);
  if (mention === null) {
    mentionSuggestionsEl.classList.add("hidden");
    return;
  }
  showMentionSuggestions(mention);
});

promptEl.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    sendPrompt();
  }
});

sendBtn.addEventListener("click", sendPrompt);

renderThread();
renderSelectedSources();
