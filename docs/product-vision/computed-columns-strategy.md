# Smart Formula Strategy: "Computed Columns"

## The Core Insight

Traditional spreadsheet formulas have a fundamental problem in a database context:
- **Formulas are ephemeral** — they exist only in the client.
- **Databases store values** — not computation logic.

**Our Solution: "Computed Columns"** — A hybrid where:
1. Formulas are **persisted as metadata** in Pegasus (not the database).
2. **Computed values** are stored in the database as regular columns.
3. On reload, Pegasus **re-applies** formulas to regenerate computed columns.

---

## How It Works

### User Flow

```
1. User opens a table with columns: [Name, Price, Quantity]

2. User creates a new column "Total" with formula: =Price * Quantity

3. Pegasus:
   - Creates column "Total" in the database (stores VALUES)
   - Saves formula metadata: { column: "Total", formula: "=Price * Quantity" }
   - Displays "Total" with a ✨ icon indicating it's computed

4. On commit:
   - Backend receives: UPDATE table SET Total = Price * Quantity

5. On reload:
   - Pegasus checks metadata, sees "Total" is computed
   - Recalculates if source columns changed
   - Shows computed indicator in header
```

---

## Technical Architecture

### 1. Formula Metadata Storage

```typescript
interface ComputedColumn {
  id: string;
  tableName: string;
  columnName: string;
  formula: string;           // "=Price * Quantity"
  dependencies: string[];    // ["Price", "Quantity"]
  createdAt: Date;
  lastApplied: Date;
}

// Stored per-connection in localStorage or backend
interface ComputedColumnsStore {
  [connectionId: string]: {
    [tableName: string]: ComputedColumn[]
  }
}
```

### 2. Formula-to-SQL Translation

Instead of storing formulas in cells, translate them to SQL on commit:

| Formula | Generated SQL |
| :--- | :--- |
| `=UPPER(Name)` | `UPDATE table SET Name_Upper = UPPER(Name)` |
| `=Price * Quantity` | `UPDATE table SET Total = Price * Quantity` |
| `=IF(Status="Active", 1, 0)` | `UPDATE table SET IsActive = CASE WHEN Status='Active' THEN 1 ELSE 0 END` |

### 3. Engine Extension

```typescript
// Engine.ts - New computed column tracking
private computedColumns: Map<number, ComputedColumn> = new Map();

setComputedColumn(col: number, formula: string) {
  const deps = this.parser.extractReferences(formula);
  this.computedColumns.set(col, {
    id: crypto.randomUUID(),
    columnName: this.columnNames[col],
    formula,
    dependencies: deps.map(ref => this.columnNames[ref.col])
  });
  
  // Apply formula to all rows
  this.applyFormulaToColumn(col, formula);
}

isComputedColumn(col: number): boolean {
  return this.computedColumns.has(col);
}
```

---

## UI Presentation

### Column Header Indicator

```
┌──────────┬──────────┬──────────┬──────────────────┐
│  Name    │  Price   │ Quantity │  Total ✨        │
│          │          │          │  =Price*Quantity │
├──────────┼──────────┼──────────┼──────────────────┤
│  Widget  │    10    │    5     │       50         │
│  Gadget  │    25    │    2     │       50         │
└──────────┴──────────┴──────────┴──────────────────┘
```

- **✨ Icon** indicates a computed column
- **Tooltip** shows the formula
- **Right-click → "Edit Formula"** to modify
- **Right-click → "Convert to Static"** to remove formula (keeps values)

### Formula Bar Evolution

```
┌─────────────────────────────────────────────────────┐
│ D2 │ =Price * Quantity                    [Computed]│
└─────────────────────────────────────────────────────┘
```

When a computed cell is selected:
- Formula bar shows the formula (read-only unless editing column)
- "Computed" badge indicates it's auto-calculated

---

## Why This Is Unique

| Traditional Approach | Pegasus "Computed Columns" |
| :--- | :--- |
| Formula lives in each cell | Formula lives at **column level** |
| Formula lost on save | Formula persisted as **metadata** |
| Can't translate to SQL | **Generates SQL** on commit |
| Recalculates locally only | **Syncs computed values** to database |
| No visibility into what's computed | **Clear visual indicators** |

---

## Integration with Inline Grid Evolution

### Phase 4 Update: "Computed Columns"

1. **Column-Level Formulas** — Formulas apply to entire columns, not cells.
2. **Metadata Persistence** — Store formula definitions in Pegasus config.
3. **SQL Generation** — Translate formulas to SQL for bulk updates.
4. **Visual Indicators** — ✨ icon, formula tooltip, "Computed" badge.
5. **AI Enhancement** — AI can suggest formulas based on column names.

---

## Example: AI-Suggested Computed Column

```
User creates new column "Full Name"

AI suggests: "I see you have 'First Name' and 'Last Name' columns.
              Would you like to compute: =First_Name & ' ' & Last_Name?"

User clicks "Apply" → Column becomes computed automatically
```

---

## AI-Generated Computed Columns

### The Feature
Users can ask the AI in natural language to compute values, and Pegasus automatically creates a new computed column.

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Chat Mode                                                      │
├─────────────────────────────────────────────────────────────────┤
│  User: "Calculate the profit margin for each product"          │
│                                                                 │
│  Pegasus: "I'll create a 'Profit Margin' column using:         │
│           =(Revenue - Cost) / Revenue * 100                    │
│                                                                 │
│           [Preview] [Apply to Table]                            │
└─────────────────────────────────────────────────────────────────┘
```

### Technical Implementation

```typescript
// Backend: AI generates formula from natural language
async function generateComputedColumn(
  prompt: string, 
  schema: { columns: string[], sampleData: any[] }
): Promise<{
  columnName: string;
  formula: string;
  explanation: string;
}> {
  const response = await aiClient.chat({
    messages: [{
      role: 'system',
      content: `You are a formula generator. Given a table schema and user request,
                generate a column name and Excel-style formula.
                Available columns: ${schema.columns.join(', ')}
                Return JSON: { columnName, formula, explanation }`
    }, {
      role: 'user',
      content: prompt
    }]
  });
  
  return JSON.parse(response);
}
```

### Example Prompts & Results

| User Prompt | Generated Column | Formula |
| :--- | :--- | :--- |
| "Calculate total with 10% tax" | `Total_With_Tax` | `=Price * 1.1` |
| "Show full address" | `Full_Address` | `=Street & ", " & City & " " & Zip` |
| "Flag orders over $500" | `High_Value` | `=IF(Amount > 500, "Yes", "No")` |
| "Days since last purchase" | `Days_Since` | `=TODAY() - Last_Purchase` |

### UI Integration

1. **Chat Command:** User types prompt in chat mode
2. **AI Response:** Shows preview of new column with sample values
3. **Preview Button:** Opens spreadsheet with temporary computed column
4. **Apply Button:** Creates the computed column permanently
5. **Visual Indicator:** New column appears with ✨ and AI badge

### Enhanced Column Header

```
┌──────────────────────────────────┐
│  Profit Margin ✨ 🤖             │
│  =(Revenue-Cost)/Revenue*100     │
│  Generated by AI                 │
└──────────────────────────────────┘
```

- **✨** = Computed column
- **🤖** = AI-generated (can be removed if user edits formula)

---

## Implementation Priority

| Step | Description | Effort |
| :--- | :--- | :--- |
| 1 | Add `ComputedColumn` type and metadata storage | 1 day |
| 2 | Modify column header to show ✨ indicator | 0.5 day |
| 3 | Implement formula-to-SQL translator | 2 days |
| 4 | Add "Create Computed Column" UI flow | 1.5 days |
| 5 | AI suggestion integration | 1 day |
| 6 | **AI-Generated Columns (Chat → Formula)** | 2 days |

**Total: ~8 days** (can run parallel to other phases)
