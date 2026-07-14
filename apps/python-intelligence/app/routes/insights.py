from __future__ import annotations

import json
import os

from fastapi import APIRouter

from app.models import InsightsResponse
from app.services.gemini import GeminiService

router = APIRouter(tags=["intelligence"])
gemini = GeminiService()


@router.post("/v1/intelligence/trigger_insights", response_model=InsightsResponse)
async def trigger_insights():
    """Scan source registry for anomalies and generate a BI insights report."""
    registry_path = "data/source_registry.json"
    sources = []
    if os.path.exists(registry_path):
        try:
            with open(registry_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                sources = data.get("sources", [])
        except Exception as e:
            print(f"[Insights] Failed to load source registry: {e}")

    # Analyze sources for numerical anomalies
    facts = []
    for src in sources:
        label = src.get("label", "Source")
        rows = src.get("table_data")
        if rows and isinstance(rows, list) and len(rows) > 0:
            numeric_cols: dict[str, list[float]] = {}
            for row in rows:
                for k, v in row.items():
                    try:
                        numeric_cols.setdefault(k, []).append(float(v))
                    except (ValueError, TypeError):
                        continue

            for col, vals in numeric_cols.items():
                if len(vals) > 1:
                    mean_val = sum(vals) / len(vals)
                    variance = sum((x - mean_val) ** 2 for x in vals) / len(vals)
                    std_dev = variance ** 0.5
                    outliers = [x for x in vals if abs(x - mean_val) > 2 * std_dev]

                    facts.append(
                        f"Table '{label}' column '{col}': rows={len(vals)}, mean={mean_val:.2f}, "
                        f"max={max(vals):.2f}, min={min(vals):.2f}, std_dev={std_dev:.2f}. "
                        f"Outliers: {outliers[:5]}"
                    )

    if not facts:
        facts.append("No active tabular datasets detected with numeric columns.")

    facts_text = "\n".join(facts)

    # Request Gemini synthesis
    prompt = (
        "You are the Pegasus BI Autonomous Anomalies Dispatcher.\n"
        "Analyze these calculated statistical metrics and highlight key correlations, "
        "extreme numeric outliers, or trend changes.\n"
        "Write a beautiful, executive-ready Markdown BI report containing bullet points, "
        "highlight boxes, and an executive summary.\n\n"
        f"CALCULATED METRICS:\n{facts_text}"
    )

    report_text = await gemini.generate(prompt, temperature=0.2, max_tokens=2048)

    if not report_text:
        report_text = (
            f"# PEGASUS BI INSIGHTS REPORT (FALLBACK)\n\n"
            f"**Executive Data Facts Summary:**\n"
            f"- Active datasets successfully scanned.\n"
            f"- Identified metrics:\n"
            + "\n".join(f"  * {f}" for f in facts)
            + "\n\nConfigure your GEMINI_API_KEY to unlock full generative anomaly reasoning!"
        )

    # Save report
    os.makedirs("data", exist_ok=True)
    report_path = "data/anomalies_dispatch.md"
    try:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_text)
    except Exception as e:
        print(f"[Insights] Failed to save report: {e}")

    return InsightsResponse(
        success=True,
        message=f"Successfully generated anomalies report at {report_path}",
        report=report_text,
    )
