<template>
  <div class="prototype-container">
    <!-- Header -->
    <header class="proto-header">
      <div class="header-left">
        <h1>Data Tab Prototype</h1>
        <span class="badge">Experimental</span>
      </div>
      <div class="header-right">
        <button 
          v-for="mode in modes" 
          :key="mode.id"
          :class="['mode-btn', { active: currentMode === mode.id }]"
          @click="currentMode = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="source-selector">
        <label>Data Source:</label>
        <select v-model="selectedSource">
          <option value="postgres">PostgreSQL - users</option>
          <option value="cosmos">Cosmos DB - OrionMetrics</option>
          <option value="file">Local CSV</option>
        </select>
      </div>
      <div class="actions">
        <button class="btn-secondary" @click="refreshData">↻ Refresh</button>
        <button class="btn-primary" v-if="currentMode === 'edit'" @click="saveChanges">💾 Save Changes</button>
      </div>
    </div>

    <!-- View: Grid (Read-Only) -->
    <section v-if="currentMode === 'readonly'" class="view-section">
      <h2>📊 Read-Only Grid Preview</h2>
      <p class="description">Fast, read-only view optimized for exploration. No editing capabilities.</p>
      <div class="data-grid readonly">
        <table>
          <thead>
            <tr>
              <th v-for="col in columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in mockData" :key="idx">
              <td v-for="col in columns" :key="col">{{ row[col] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- View: Editable Grid -->
    <section v-if="currentMode === 'edit'" class="view-section">
      <h2>✏️ Editable Grid</h2>
      <p class="description">Click any cell to edit. Changes are tracked and can be saved.</p>
      <div class="data-grid editable">
        <table>
          <thead>
            <tr>
              <th v-for="col in columns" :key="col">{{ col }}</th>
              <th class="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in mockData" :key="idx" :class="{ modified: modifiedRows.has(idx) }">
              <td v-for="col in columns" :key="col" @dblclick="startEdit(idx, col)">
                <input 
                  v-if="editingCell?.row === idx && editingCell?.col === col"
                  v-model="row[col]"
                  @blur="endEdit(idx)"
                  @keyup.enter="endEdit(idx)"
                  autofocus
                />
                <span v-else>{{ row[col] }}</span>
              </td>
              <td class="actions-col">
                <button class="btn-icon" title="Delete Row">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="change-tracker" v-if="modifiedRows.size > 0">
        <span>{{ modifiedRows.size }} row(s) modified</span>
      </div>
    </section>

    <!-- View: Card Layout -->
    <section v-if="currentMode === 'cards'" class="view-section">
      <h2>🃏 Card Layout</h2>
      <p class="description">Ideal for NoSQL/document-style data with variable schemas.</p>
      <div class="card-grid">
        <div class="data-card" v-for="(row, idx) in mockData" :key="idx">
          <div class="card-header">
            <span class="card-id">{{ row.id || row.serverId || `Record ${idx + 1}` }}</span>
            <button class="btn-icon" title="Edit Record">✏️</button>
          </div>
          <div class="card-body">
            <div class="field" v-for="col in columns.filter(c => c !== 'id' && c !== 'serverId')" :key="col">
              <label>{{ col }}</label>
              <span>{{ row[col] }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- View: Query-Driven -->
    <section v-if="currentMode === 'query'" class="view-section">
      <h2>🔍 Query-Driven View</h2>
      <p class="description">Sheet is read-only. All mutations go through explicit SQL/MQL commands.</p>
      <div class="query-panel">
        <textarea v-model="customQuery" placeholder="SELECT * FROM users WHERE status = 'active'"></textarea>
        <button class="btn-primary" @click="runQuery">▶ Run Query</button>
      </div>
      <div class="data-grid readonly">
        <table>
          <thead>
            <tr>
              <th v-for="col in columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in mockData" :key="idx">
              <td v-for="col in columns" :key="col">{{ row[col] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Feedback Section -->
    <footer class="proto-footer">
      <h3>Which style feels best?</h3>
      <div class="feedback-buttons">
        <button @click="vote('readonly')">🔍 Read-Only Grid</button>
        <button @click="vote('edit')">✏️ Editable Grid</button>
        <button @click="vote('cards')">🃏 Card Layout</button>
        <button @click="vote('query')">🔍 Query-Driven</button>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const currentMode = ref('readonly')
const selectedSource = ref('postgres')
const customQuery = ref('')
const editingCell = ref(null)
const modifiedRows = ref(new Set())

const modes = [
  { id: 'readonly', label: '🔍 Read-Only' },
  { id: 'edit', label: '✏️ Editable' },
  { id: 'cards', label: '🃏 Cards' },
  { id: 'query', label: '💻 Query' }
]

// Mock data
const mockData = ref([
  { id: 'u-001', name: 'Alice Johnson', email: 'alice@example.com', status: 'active', role: 'Admin' },
  { id: 'u-002', name: 'Bob Smith', email: 'bob@example.com', status: 'active', role: 'User' },
  { id: 'u-003', name: 'Carol Williams', email: 'carol@example.com', status: 'inactive', role: 'User' },
  { id: 'u-004', name: 'David Brown', email: 'david@example.com', status: 'active', role: 'Moderator' },
  { id: 'u-005', name: 'Eve Davis', email: 'eve@example.com', status: 'pending', role: 'User' },
])

const columns = computed(() => {
  if (mockData.value.length === 0) return []
  return Object.keys(mockData.value[0])
})

function refreshData() {
  console.log('[Prototype] Refreshing data from:', selectedSource.value)
}

function saveChanges() {
  console.log('[Prototype] Saving changes for rows:', [...modifiedRows.value])
  modifiedRows.value.clear()
}

function startEdit(rowIdx, col) {
  editingCell.value = { row: rowIdx, col }
}

function endEdit(rowIdx) {
  modifiedRows.value.add(rowIdx)
  editingCell.value = null
}

function runQuery() {
  console.log('[Prototype] Running query:', customQuery.value)
}

function vote(mode) {
  console.log('[Prototype] User voted for:', mode)
  alert(`Thanks! You voted for: ${mode}`)
}
</script>

<style scoped>
.prototype-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
  color: #e0e0e0;
  padding: 24px;
  font-family: 'Inter', -apple-system, sans-serif;
}

.proto-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.proto-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.badge {
  background: linear-gradient(135deg, #ff6b6b, #ffa07a);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
  margin-left: 12px;
  text-transform: uppercase;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  gap: 8px;
}

.mode-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  color: #a0a0a0;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: rgba(255,255,255,0.1);
  color: #fff;
}

.mode-btn.active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-color: transparent;
  color: #fff;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.03);
  border-radius: 12px;
}

.source-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}

.source-selector select {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-secondary {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  color: #a0a0a0;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.view-section {
  margin-bottom: 32px;
}

.view-section h2 {
  font-size: 1.2rem;
  margin-bottom: 8px;
}

.description {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 16px;
}

/* Grid Styles */
.data-grid {
  overflow-x: auto;
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
}

.data-grid table {
  width: 100%;
  border-collapse: collapse;
}

.data-grid th {
  background: rgba(255,255,255,0.05);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #a0a0a0;
}

.data-grid td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.data-grid.editable td {
  cursor: pointer;
}

.data-grid.editable tr:hover {
  background: rgba(102, 126, 234, 0.1);
}

.data-grid.editable tr.modified {
  background: rgba(255, 193, 7, 0.1);
}

.data-grid td input {
  background: rgba(0,0,0,0.5);
  border: 1px solid #667eea;
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  width: 100%;
}

.actions-col {
  width: 80px;
  text-align: center;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

.change-tracker {
  padding: 12px;
  background: rgba(255, 193, 7, 0.15);
  border-radius: 8px;
  margin-top: 12px;
  text-align: center;
  color: #ffc107;
  font-weight: 500;
}

/* Card Layout */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.data-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.data-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(102, 126, 234, 0.15);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.card-id {
  font-weight: 600;
  color: #667eea;
}

.card-body {
  padding: 16px;
}

.card-body .field {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.card-body .field:last-child {
  border-bottom: none;
}

.card-body .field label {
  color: #888;
  font-size: 0.85rem;
}

.card-body .field span {
  font-weight: 500;
}

/* Query Panel */
.query-panel {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.query-panel textarea {
  flex: 1;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
  color: #fff;
  padding: 12px;
  border-radius: 8px;
  font-family: 'Fira Code', monospace;
  resize: vertical;
  min-height: 60px;
}

/* Footer */
.proto-footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid rgba(255,255,255,0.1);
  text-align: center;
}

.proto-footer h3 {
  margin-bottom: 16px;
  font-weight: 500;
}

.feedback-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.feedback-buttons button {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  color: #a0a0a0;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.feedback-buttons button:hover {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-color: transparent;
  color: #fff;
}
</style>
