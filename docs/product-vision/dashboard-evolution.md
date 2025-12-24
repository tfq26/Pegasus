# Dashboard Evolution Strategy

## Overview
Transform Pegasus dashboards from static displays into **intelligent, interactive data hubs** that leverage our spreadsheet core and AI capabilities.

---

## Phase 1: Foundation (Weeks 1-2)

### 1.1 Parameterized Filters
Global filters at dashboard top that affect all widgets.

```
┌─────────────────────────────────────────────────────────┐
│ 📅 Date Range: [Last 30 Days ▼]  👤 Customer: [All ▼]  │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
- Filter config stored in dashboard metadata
- Each widget query includes filter parameters
- Filters persist in URL for shareable links

### 1.2 Drill-Down to Spreadsheet
Click any chart element → Opens filtered data in spreadsheet tab.

**Flow:**
1. User clicks bar in "Sales by Region" chart
2. Pegasus opens new spreadsheet tab: `Sales - West Region`
3. Data is pre-filtered to that segment

### 1.3 Goal Lines & Thresholds
Add horizontal reference lines to charts.

```
Revenue  │
  $120K  │─────────────────── ✓ Target
  $100K  │      ████
   $80K  │ ████ ████ ████
         └─────────────────
           Jan  Feb  Mar
```

**Config:**
```typescript
interface ThresholdLine {
  value: number;
  label: string;
  color: 'green' | 'yellow' | 'red';
  style: 'solid' | 'dashed';
}
```

---

## Phase 2: Intelligence (Weeks 3-4)

### 2.1 AI Insights Panel
Collapsible sidebar showing AI-generated observations.

**Trigger:** On dashboard load + on-demand "Analyze" button

```
┌────────────────────────────────┐
│ 🧠 AI Insights          [↻]   │
├────────────────────────────────┤
│ • Revenue up 15% vs last month│
│ • Unusual spike on Dec 15     │
│ • Top customer: Acme Corp     │
│                               │
│ [Ask a question...]           │
└────────────────────────────────┘
```

**Behavior:**
- **On Load:** Auto-analyze if enabled in settings
- **On Demand:** Click ↻ to refresh insights
- **Cached:** Results cached for 5 mins to reduce API calls

### 2.2 Natural Language Dashboard Builder
Create dashboards via chat.

**Prompt:** *"Create a dashboard with monthly revenue, top customers, and order trends"*

**AI Response:**
```
I'll create a dashboard with:
1. Monthly Revenue (Line Chart)
2. Top 10 Customers (Bar Chart)
3. Order Trends (Area Chart)

[Preview] [Create Dashboard]
```

### 2.3 Anomaly Detection
AI monitors data and highlights outliers.

**Visual:** Anomaly points on charts marked with ⚠️
**Panel:** Anomalies listed in AI Insights sidebar

---

## Phase 3: Collaboration (Weeks 5-6)

### 3.1 Comments & Annotations
Click any chart → Add threaded comments.

```
┌──────────────────────────────┐
│ 💬 2 comments on this chart  │
├──────────────────────────────┤
│ @CFO: Why the Q3 dip?        │
│ └─ @Analyst: Supply chain... │
└──────────────────────────────┘
```

### 3.2 Public Embed Links
Generate shareable URLs for external embedding.

**Options:**
- Public (anyone with link)
- Password-protected
- SSO-only (enterprise)

### 3.3 Scheduled Reports
Email dashboard snapshots on schedule.

**Config:**
- Recipients (email list)
- Schedule (daily/weekly/monthly)
- Format (PDF / PNG / Live Link)

---

## Phase 4: Real-Time (Future)

### 4.1 Live Data Mirrors
WebSocket-powered auto-refresh.

**Requires:** Backend WebSocket infrastructure

---

## AI Behavior Summary

| Trigger | Action |
| :--- | :--- |
| **Dashboard Load** | Auto-analyze (if enabled) |
| **Click "Analyze"** | Refresh AI insights |
| **Data Changes** | Re-analyze affected widgets |
| **User Question** | Answer via insights panel chat |

**Caching:** 5-minute cache on insights to reduce costs.

---

## Files to Create/Modify

| File | Purpose |
| :--- | :--- |
| `DashboardFilters.vue` | Global filter bar component |
| `DrillDownHandler.ts` | Click-to-spreadsheet logic |
| `AIInsightsPanel.vue` | Collapsible AI sidebar |
| `ThresholdConfig.vue` | Goal line editor |
| `DashboardBuilder.ts` | NL-to-dashboard generator |
