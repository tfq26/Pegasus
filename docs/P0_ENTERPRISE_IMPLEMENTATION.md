# P0 Enterprise Features - Implementation Plan

## Quick Start: Top 3 Features to Build First

These features offer the highest impact with the least friction given Pegasus's current stack. Each addresses multiple competitor weaknesses and leverages existing infrastructure.

---

## Feature 1: AI Query Optimizer & Explainer

### The Problem We're Solving
- SSMS users manually analyze execution plans (complex, time-consuming)
- Power BI users write DAX without understanding performance implications
- Junior analysts write slow queries that impact database performance

### The Pegasus Advantage
> "Write any query, and Pegasus tells you how to make it faster—or fixes it for you."

### Implementation Details

#### Phase 1: Query Plan Capture (Backend)

**File:** `apps/backend/src/routes/chat.js`

Add to the query execution flow:
```javascript
// After query execution, capture explain plan for supported databases
async function captureQueryPlan(connection, query, dbType) {
  const explainCommands = {
    postgres: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
    mysql: `EXPLAIN FORMAT=JSON ${query}`,
    surrealdb: null // SurrealDB doesn't support EXPLAIN yet
  };
  
  const explainQuery = explainCommands[dbType];
  if (!explainQuery) return null;
  
  try {
    const plan = await connection.query(explainQuery);
    return {
      rawPlan: plan,
      executionTime: extractExecutionTime(plan),
      rowsScanned: extractRowsScanned(plan),
      indexesUsed: extractIndexes(plan),
      warnings: detectWarnings(plan)
    };
  } catch {
    return null; // Some queries can't be explained
  }
}
```

#### Phase 2: AI Analysis (Backend)

**File:** `apps/backend/src/routes/chat.js` (new endpoint)

```javascript
chat.post('/api/analyze-query', authMiddleware, async (c) => {
  const { query, queryPlan, schema, dbType } = await c.req.json();
  
  const prompt = `You are a database performance expert. Analyze this query and execution plan.

DATABASE: ${dbType}
SCHEMA CONTEXT:
${JSON.stringify(schema, null, 2)}

QUERY:
${query}

EXECUTION PLAN:
${JSON.stringify(queryPlan, null, 2)}

Provide analysis in this JSON format:
{
  "performanceRating": "good|warning|critical",
  "estimatedTime": "fast (<100ms)|moderate (100ms-1s)|slow (>1s)",
  "issues": [
    {
      "type": "missing_index|full_table_scan|inefficient_join|etc",
      "severity": "low|medium|high",
      "description": "Human-readable explanation",
      "recommendation": "Specific fix suggestion",
      "sql": "CREATE INDEX... or rewritten query if applicable"
    }
  ],
  "optimizedQuery": "Rewritten query if improvements possible, or null",
  "explanation": "Brief summary for display"
}`;

  const analysis = await aiClient.generateText({
    prompt,
    maxTokens: 1500,
    temperature: 0.2 // Low temp for accurate analysis
  });
  
  return c.json(JSON.parse(analysis));
});
```

#### Phase 3: UI Component

**New File:** `apps/ui/src/components/Chat/QueryOptimizer.vue`

```vue
<template>
  <div v-if="analysis" class="query-optimizer">
    <div class="optimizer-header" :class="analysis.performanceRating">
      <component :is="ratingIcon" class="w-5 h-5" />
      <span>{{ analysis.explanation }}</span>
    </div>
    
    <div v-if="analysis.issues.length" class="issues-list">
      <div v-for="issue in analysis.issues" :key="issue.type" class="issue-card">
        <Badge :variant="severityVariant(issue.severity)">
          {{ issue.type.replace('_', ' ') }}
        </Badge>
        <p>{{ issue.description }}</p>
        <p class="recommendation">💡 {{ issue.recommendation }}</p>
        <Button v-if="issue.sql" size="sm" @click="applySql(issue.sql)">
          Apply Fix
        </Button>
      </div>
    </div>
    
    <div v-if="analysis.optimizedQuery" class="optimized-query">
      <h4>Optimized Query</h4>
      <CodeBlock :code="analysis.optimizedQuery" language="sql" />
      <Button @click="applyOptimizedQuery">Use This Query</Button>
    </div>
  </div>
</template>
```

#### Integration Points
1. Add "Analyze" button next to Execute in Chat toolbar
2. Show optimizer panel in results area when analysis available
3. Store optimization history for learning

---

## Feature 2: Smart Data Profiling

### The Problem We're Solving
- Power BI assumes data is already clean (it never is)
- No competitor offers automatic data quality assessment
- Data issues discovered late cause dashboard errors

### The Pegasus Advantage
> "Know your data's health before you analyze it. Auto-fix with one click."

### Implementation Details

#### Phase 1: Profiling Engine (Backend)

**New File:** `apps/backend/src/services/DataProfiler.js`

```javascript
export class DataProfiler {
  static async profileColumn(data, columnName) {
    const values = data.map(row => row[columnName]);
    const nonNullValues = values.filter(v => v != null && v !== '');
    
    return {
      columnName,
      totalRows: values.length,
      nullCount: values.length - nonNullValues.length,
      nullPercent: ((values.length - nonNullValues.length) / values.length * 100).toFixed(1),
      uniqueCount: new Set(nonNullValues).size,
      duplicateCount: nonNullValues.length - new Set(nonNullValues).size,
      
      // Type inference
      inferredType: this.inferType(nonNullValues),
      typeConsistency: this.checkTypeConsistency(nonNullValues),
      
      // Pattern detection
      patterns: this.detectPatterns(nonNullValues),
      anomalies: this.detectAnomalies(nonNullValues),
      
      // Statistics (for numeric)
      stats: this.calculateStats(nonNullValues),
      
      // Sample values
      samples: nonNullValues.slice(0, 5)
    };
  }
  
  static inferType(values) {
    const sample = values.slice(0, 100);
    const types = sample.map(v => {
      if (typeof v === 'number' || !isNaN(Number(v))) return 'number';
      if (Date.parse(v)) return 'date';
      if (/^[\w.-]+@[\w.-]+\.\w+$/.test(v)) return 'email';
      if (/^\+?[\d\s-()]+$/.test(v)) return 'phone';
      if (/^https?:\/\//.test(v)) return 'url';
      return 'string';
    });
    
    // Return most common type
    const counts = {};
    types.forEach(t => counts[t] = (counts[t] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  
  static detectPatterns(values) {
    const patterns = [];
    const sample = values.slice(0, 100);
    
    // Date format inconsistency
    const dateFormats = this.detectDateFormats(sample);
    if (dateFormats.length > 1) {
      patterns.push({
        type: 'date_format_inconsistency',
        severity: 'medium',
        description: `Mixed date formats detected: ${dateFormats.join(', ')}`,
        fixable: true
      });
    }
    
    // Case inconsistency
    const caseStats = this.analyzeCasing(sample);
    if (caseStats.mixed) {
      patterns.push({
        type: 'case_inconsistency',
        severity: 'low',
        description: `${caseStats.upper}% UPPER, ${caseStats.lower}% lower, ${caseStats.mixed}% Mixed`,
        fixable: true
      });
    }
    
    // Whitespace issues
    const whitespaceIssues = sample.filter(v => 
      typeof v === 'string' && (v !== v.trim() || v.includes('  '))
    ).length;
    if (whitespaceIssues > 0) {
      patterns.push({
        type: 'whitespace_issues',
        severity: 'medium',
        description: `${whitespaceIssues} values have leading/trailing/double spaces`,
        fixable: true
      });
    }
    
    return patterns;
  }
  
  static async generateFixes(profile) {
    // AI-powered fix suggestions
    const fixes = [];
    
    if (profile.nullPercent > 20) {
      fixes.push({
        type: 'null_handling',
        options: [
          { action: 'fill_default', label: 'Fill with default value' },
          { action: 'fill_mean', label: 'Fill with mean (numeric)' },
          { action: 'fill_mode', label: 'Fill with most common value' },
          { action: 'drop_rows', label: 'Remove rows with nulls' }
        ]
      });
    }
    
    for (const pattern of profile.patterns) {
      if (pattern.fixable) {
        fixes.push({
          type: pattern.type,
          action: 'auto_fix',
          description: `Auto-fix: ${pattern.description}`
        });
      }
    }
    
    return fixes;
  }
}
```

#### Phase 2: API Endpoint

**File:** `apps/backend/src/routes/table.js`

```javascript
table.post('/api/profile/:connectionId/:tableName', async (c) => {
  const { connectionId, tableName } = c.req.param();
  
  // Get data sample (first 10K rows for profiling)
  const data = await fetchTableData(connectionId, tableName, { limit: 10000 });
  
  // Profile each column
  const columns = Object.keys(data[0] || {});
  const profiles = await Promise.all(
    columns.map(col => DataProfiler.profileColumn(data, col))
  );
  
  // Overall table health score
  const healthScore = calculateHealthScore(profiles);
  
  return c.json({
    tableName,
    rowCount: data.length,
    columnCount: columns.length,
    healthScore,
    columns: profiles,
    recommendations: generateRecommendations(profiles)
  });
});
```

#### Phase 3: UI Component

**New File:** `apps/ui/src/components/Explorer/DataProfileSidebar.vue`

```vue
<template>
  <div class="data-profile-sidebar">
    <div class="health-header">
      <h3>Data Health</h3>
      <div class="health-score" :class="scoreClass">
        {{ profile?.healthScore }}%
      </div>
    </div>
    
    <div class="columns-list">
      <div v-for="col in profile?.columns" :key="col.columnName" class="column-card">
        <div class="column-header">
          <span class="column-name">{{ col.columnName }}</span>
          <Badge>{{ col.inferredType }}</Badge>
        </div>
        
        <div class="column-stats">
          <div class="stat" :class="{ warning: col.nullPercent > 10 }">
            <span>Nulls</span>
            <span>{{ col.nullPercent }}%</span>
          </div>
          <div class="stat" :class="{ warning: col.duplicateCount > 0 }">
            <span>Duplicates</span>
            <span>{{ col.duplicateCount }}</span>
          </div>
          <div class="stat">
            <span>Unique</span>
            <span>{{ col.uniqueCount }}</span>
          </div>
        </div>
        
        <div v-if="col.patterns.length" class="patterns">
          <div v-for="pattern in col.patterns" :key="pattern.type" 
               class="pattern-badge" :class="pattern.severity">
            ⚠️ {{ pattern.description }}
            <Button v-if="pattern.fixable" size="xs" @click="fix(col, pattern)">
              Fix
            </Button>
          </div>
        </div>
      </div>
    </div>
    
    <Button v-if="hasIssues" class="fix-all-btn" @click="fixAll">
      🔧 Auto-Fix All Issues
    </Button>
  </div>
</template>
```

---

## Feature 3: AI Formula Bar

### The Problem We're Solving
- Excel formulas have steep learning curve
- Power BI DAX is even harder
- Users know WHAT they want but not HOW to write it

### The Pegasus Advantage
> "Type what you want in plain English, get the formula instantly."

### Implementation Details

#### Phase 1: Backend Endpoint

**File:** `apps/backend/src/routes/chat.js`

```javascript
chat.post('/api/generate-formula', authMiddleware, async (c) => {
  const { naturalLanguage, sheetContext, availableColumns } = await c.req.json();
  
  const prompt = `You are an Excel/spreadsheet formula expert. Convert natural language to spreadsheet formulas.

AVAILABLE COLUMNS (with sample data):
${availableColumns.map(c => `- ${c.label}: ${c.samples.join(', ')}`).join('\n')}

USER REQUEST: "${naturalLanguage}"

Respond with JSON:
{
  "formula": "=FORMULA_HERE",
  "explanation": "What this formula does",
  "steps": ["Step 1...", "Step 2..."],
  "alternativeFormulas": [
    {"formula": "...", "description": "Alternative approach"}
  ]
}

RULES:
1. Use Excel-compatible formulas (works in HyperFormula)
2. Reference columns by their letter (A, B, C...) or ranges (A:A, B2:B100)
3. Prefer simpler formulas when possible
4. Include error handling with IFERROR when appropriate`;

  const result = await aiClient.generateText({
    prompt,
    maxTokens: 800,
    temperature: 0.3
  });
  
  return c.json(JSON.parse(result));
});
```

#### Phase 2: UI Integration

**File:** `apps/ui/src/components/Chat/ChatToolbar.vue`

Add AI formula mode toggle:
```vue
<template>
  <!-- Existing toolbar content -->
  
  <div v-if="mode === 'spreadsheet'" class="formula-bar">
    <div class="formula-input-wrapper">
      <Button 
        variant="ghost" 
        size="icon"
        :class="{ active: aiFormulaMode }"
        @click="toggleAiFormula"
      >
        <Sparkles class="w-4 h-4" />
      </Button>
      
      <input 
        v-if="aiFormulaMode"
        v-model="aiFormulaInput"
        :placeholder="'Describe your formula in English...'"
        @keydown.enter="generateFormula"
        class="ai-formula-input"
      />
      
      <div v-if="suggestedFormula" class="formula-suggestion">
        <code>{{ suggestedFormula.formula }}</code>
        <span class="explanation">{{ suggestedFormula.explanation }}</span>
        <Button size="sm" @click="applyFormula">Apply</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
const aiFormulaMode = ref(false);
const aiFormulaInput = ref('');
const suggestedFormula = ref(null);

async function generateFormula() {
  const columns = getSpreadsheetColumns(); // From current sheet
  
  const response = await api.post('/chat/generate-formula', {
    naturalLanguage: aiFormulaInput.value,
    availableColumns: columns
  });
  
  suggestedFormula.value = response.data;
}

function applyFormula() {
  // Insert formula into currently selected cell
  emit('apply-formula', suggestedFormula.value.formula);
  suggestedFormula.value = null;
  aiFormulaInput.value = '';
}
</script>
```

#### Example Interactions

| User Types | Pegasus Returns |
|------------|-----------------|
| "sum of column B" | `=SUM(B:B)` |
| "average of sales for california" | `=AVERAGEIF(A:A,"California",B:B)` |
| "count unique customers" | `=SUMPRODUCT(1/COUNTIF(A:A,A:A))` |
| "percentage change from last row" | `=(B2-B1)/B1*100` |
| "if amount > 1000 then high else low" | `=IF(C2>1000,"High","Low")` |

---

## Integration Timeline

### Week 1-2: AI Query Optimizer
- [ ] Add EXPLAIN capture for PostgreSQL and MySQL
- [ ] Create `/api/analyze-query` endpoint
- [ ] Build QueryOptimizer.vue component
- [ ] Integrate into Chat results view
- [ ] Add "Analyze" button to toolbar

### Week 3-4: Data Profiler
- [ ] Build DataProfiler.js service
- [ ] Add `/api/profile` endpoint
- [ ] Create DataProfileSidebar.vue
- [ ] Integrate with Explorer table view
- [ ] Add health indicators to table list

### Week 5-6: AI Formula Bar
- [ ] Create `/api/generate-formula` endpoint
- [ ] Add AI formula toggle to toolbar
- [ ] Build formula suggestion UI
- [ ] Integrate with spreadsheet engine
- [ ] Add formula history/favorites

### Week 7-8: Polish & Beta
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Beta testing with 3-5 users
- [ ] Iterate based on feedback

---

## Success Metrics

| Feature | KPI | Target |
|---------|-----|--------|
| Query Optimizer | % queries analyzed | 50% of queries |
| Query Optimizer | Optimization adoption rate | 30% apply suggestions |
| Data Profiler | Tables profiled | 80% of opened tables |
| Data Profiler | Issues auto-fixed | 40% one-click fix |
| AI Formula Bar | Formula generation accuracy | 90% correct on first try |
| AI Formula Bar | Time saved vs manual | 60% faster |

---

## Competitive Advantage Summary

After implementing these P0 features, Pegasus will offer:

1. **AI Query Optimizer** → First BI tool to proactively optimize queries
2. **Data Profiling** → Only tool with built-in, AI-powered data quality
3. **AI Formula Bar** → Most intuitive formula creation in the market

This positions Pegasus as the **"AI-first data platform"** that competitors can't match by simply bolting on AI features.
