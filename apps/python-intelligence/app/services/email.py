from __future__ import annotations

from app.config import settings


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send email via Resend."""
    if not settings.resend_api_key:
        print(f"[Email] No RESEND_API_KEY configured, skipping email to {to}")
        return False

    import httpx

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": "Pegasus <notifications@pegasus.dev>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
            return resp.is_success
    except Exception as e:
        print(f"[Email] Failed to send: {e}")
        return False


async def send_critical_feedback(feedback: dict) -> None:
    """Send critical feedback notification to the developer."""
    await send_email(
        to=settings.developer_email,
        subject=f"🚨 Critical Feedback: {feedback.get('feature_category', 'Unknown')}",
        html=f"""
        <h2>Critical Feedback Received</h2>
        <p><strong>Priority:</strong> {feedback.get('priority', 'normal').upper()}</p>
        <p><strong>Feature:</strong> {feedback.get('feature_category', '')}</p>
        <p><strong>User Email:</strong> {feedback.get('user_email', 'Not provided')}</p>
        <hr>
        <p>{feedback.get('description', '')}</p>
        """,
    )


async def send_weekly_digest(feedback_list: list[dict]) -> None:
    """Send weekly feedback digest."""
    if not feedback_list:
        return

    critical = [f for f in feedback_list if f.get("priority") == "critical"]
    normal = [f for f in feedback_list if f.get("priority") == "normal"]

    html = f"""
    <h2>Weekly Feedback Digest</h2>
    <p><strong>Total:</strong> {len(feedback_list)} | <strong>Critical:</strong> {len(critical)} | <strong>Normal:</strong> {len(normal)}</p>
    """
    if critical:
        html += "<h3>🚨 Critical Issues</h3><ul>"
        for item in critical:
            html += f"<li><strong>{item.get('issue_type')}</strong>: {item.get('description', '')[:200]}</li>"
        html += "</ul>"

    await send_email(
        to=settings.developer_email,
        subject=f"📊 Weekly Feedback Digest - {len(feedback_list)} items",
        html=html,
    )
