# Tool Testing Suite

This directory contains test utilities for the SpreadsheetToolService.

## Files

### 1. `tool-sandbox.js` - Automated Test Suite
Runs all 22 tools with predefined test cases.

**Usage:**
```bash
node tests/tool-sandbox.js
```

**What it does:**
- Tests all 10 spreadsheet tools
- Tests all 12 query tools
- Uses sample mutual fund data
- Shows colored output with pass/fail status

**Example output:**
```
🧪 SpreadsheetToolService Test Sandbox
Testing all 22 tools with sample mutual fund data

============================================================
🔷 SPREADSHEET TOOLS
============================================================

📋 Test: analyze_data - "Which fund has the highest value?"
{
  "type": "text_answer",
  "answer": "Analysis of: Which fund has the highest value?",
  "data": { ... }
}
✅ PASS
```

---

### 2. `interactive-tool-test.js` - Interactive CLI Tester
Manual testing interface for individual tools.

**Usage:**
```bash
node tests/interactive-tool-test.js
```

**Commands:**
- `list` - List all tools
- `list spreadsheet` - List spreadsheet tools only
- `list query` - List query tools only
- `test <tool_name>` - Test a specific tool
- `data` - Show sample data
- `help <tool_name>` - Show tool parameters
- `exit` - Exit

**Example session:**
```
> list spreadsheet
🔷 Spreadsheet Tools (10 total):
  1. analyze_data
     Answer a question about the spreadsheet data
  2. calculate_column
     Compute new column values (shows math reasoning)
  ...

> test analyze_data
🧪 Testing: analyze_data
Description: Answer a question about the spreadsheet data

Example parameters:
{
  "question": "Which fund has the highest value?"
}

✅ Result:
{
  "type": "text_answer",
  "answer": "Analysis of: Which fund has the highest value?",
  "data": { ... }
}
```

---

## Sample Data

Both test files use the same sample mutual fund dataset:

| Fund Name | Value | Returns (%) | Category | Risk |
|-----------|-------|-------------|----------|------|
| Kotak Large Cap Reg-G | 1,656,949 | 38.08 | Large Cap | Medium |
| Axis Midcap Reg-G | 1,591,685 | 35.46 | Mid Cap | High |
| HDFC Mid Cap Reg-G | 1,076,811 | 12.17 | Mid Cap | High |
| ... | ... | ... | ... | ... |

---

## Tool Categories

### 🔷 Spreadsheet Tools (10)
1. `analyze_data` - Answer questions
2. `calculate_column` - Compute values
3. `apply_conditional_formatting` - Highlight cells
4. `forecast` - Predict future values
5. `clean_data` - Standardize/deduplicate
6. `summarize_data` - Generate insights
7. `compare_data` - Compare tables
8. `sort_data` - Sort by column
9. `suggest_chart` - Recommend visualization
10. `apply_template` - Transform to template

### 🔶 Query Tools (12)
1. `format_query` - Prettify SQL
2. `explain_query` - Explain in plain English
3. `optimize_query` - Performance tips
4. `fix_query_error` - Debug errors
5. `generate_query` - Natural language → SQL
6. `create_index` - Suggest indexes
7. `generate_test_data` - Create mock data
8. `convert_dialect` - Change SQL flavor
9. `save_as_view` - Create a view
10. `diff_queries` - Compare queries
11. `analyze_query_performance` - Execution metrics

---

## Next Steps

1. **Run automated tests:**
   ```bash
   node tests/tool-sandbox.js
   ```

2. **Test individual tools:**
   ```bash
   node tests/interactive-tool-test.js
   ```

3. **Verify tool outputs** match expected structure

4. **Integrate with AI** for end-to-end testing
