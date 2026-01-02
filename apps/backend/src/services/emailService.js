// Email Service using Resend
// https://resend.com/docs

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEVELOPER_EMAIL = process.env.DEVELOPER_EMAIL || 'admin@example.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Pegasus <noreply@pegasus.app>';

/**
 * Send an email using Resend API
 */
export async function sendEmail({ to, subject, html, text }) {
    if (!RESEND_API_KEY) {
        console.warn('[Email] RESEND_API_KEY not configured, skipping email');
        return { success: false, error: 'Email not configured' };
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: Array.isArray(to) ? to : [to],
                subject,
                html,
                text
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Email] Failed to send:', error);
            return { success: false, error };
        }

        const data = await response.json();
        console.log('[Email] Sent successfully:', data.id);
        return { success: true, id: data.id };
    } catch (e) {
        console.error('[Email] Error:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Notify admin of a new experimental access request
 */
export async function notifyExperimentalRequest({ userEmail, userName, reason }) {
    const subject = '🧪 New Experimental Access Request';

    const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">New Experimental Access Request</h2>
            <p>A user has requested access to experimental features:</p>
            
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 0 0 8px 0;"><strong>User:</strong> ${userName || 'Unknown'}</p>
                <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${userEmail}</p>
                <p style="margin: 0;"><strong>Reason:</strong> ${reason || 'No reason provided'}</p>
            </div>
            
            <p>To grant access:</p>
            <ol>
                <li>Go to <a href="https://dashboard.workos.com">WorkOS Dashboard</a></li>
                <li>Find the user by email: ${userEmail}</li>
                <li>Add metadata: <code>{ "experimental_access": true }</code></li>
            </ol>
            
            <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                This notification was sent from Pegasus.
            </p>
        </div>
    `;

    const text = `
New Experimental Access Request

User: ${userName || 'Unknown'}
Email: ${userEmail}
Reason: ${reason || 'No reason provided'}

To grant access:
1. Go to WorkOS Dashboard (https://dashboard.workos.com)
2. Find the user by email: ${userEmail}
3. Add metadata: { "experimental_access": true }
    `;

    return sendEmail({
        to: DEVELOPER_EMAIL,
        subject,
        html,
        text
    });
}

export default {
    sendEmail,
    notifyExperimentalRequest
};
