import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const DEVELOPER_EMAIL = process.env.DEVELOPER_EMAIL || 'developer@example.com'

export async function sendCriticalFeedbackEmail(feedback) {
  try {
    if (!resend) return;
    await resend.emails.send({
      from: 'Pegasus Feedback <feedback@pegasus.dev>',
      to: DEVELOPER_EMAIL,
      subject: `🚨 Critical Feedback: ${feedback.feature_category}`,
      html: `
        <h2>Critical Feedback Received</h2>
        <p><strong>Priority:</strong> ${feedback.priority.toUpperCase()}</p>
        <p><strong>Feature:</strong> ${feedback.feature_category}${feedback.custom_feature ? ` - ${feedback.custom_feature}` : ''}</p>
        <p><strong>Issue Type:</strong> ${feedback.issue_type}</p>
        <p><strong>User Email:</strong> ${feedback.user_email || 'Not provided'}</p>
        <p><strong>Marked as Urgent:</strong> ${feedback.is_urgent ? 'Yes' : 'No'}</p>
        <hr>
        <h3>Description:</h3>
        <p>${feedback.description}</p>
        <hr>
        <p><small>Browser: ${feedback.browser_info || 'Unknown'}</small></p>
        <p><small>Submitted: ${new Date(feedback.created_at).toLocaleString()}</small></p>
      `
    })
  } catch (error) {
    console.error('Failed to send critical feedback email:', error)
  }
}

export async function sendWeeklyDigest(feedbackList) {
  if (feedbackList.length === 0) return

  const criticalFeedback = feedbackList.filter(f => f.priority === 'critical')
  const normalFeedback = feedbackList.filter(f => f.priority === 'normal')

  const groupByCategory = (items) => {
    return items.reduce((acc, item) => {
      const cat = item.feature_category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(item)
      return acc
    }, {})
  }

  const criticalByCategory = groupByCategory(criticalFeedback)
  const normalByCategory = groupByCategory(normalFeedback)

  const renderFeedbackSection = (title, grouped) => {
    if (Object.keys(grouped).length === 0) return ''

    return `
      <h3>${title}</h3>
      ${Object.entries(grouped).map(([category, items]) => `
        <h4>${category} (${items.length})</h4>
        <ul>
          ${items.map(item => `
            <li>
              <strong>${item.issue_type}</strong>: ${item.description.substring(0, 100)}${item.description.length > 100 ? '...' : ''}
              ${item.user_email ? `<br><small>From: ${item.user_email}</small>` : ''}
            </li>
          `).join('')}
        </ul>
      `).join('')}
    `
  }

  try {
    if (!resend) return;
    await resend.emails.send({
      from: 'Pegasus Feedback <feedback@pegasus.dev>',
      to: DEVELOPER_EMAIL,
      subject: `📊 Weekly Feedback Digest - ${feedbackList.length} items`,
      html: `
        <h2>Weekly Feedback Digest</h2>
        <p>Summary of feedback from the past week</p>
        <p><strong>Total Feedback:</strong> ${feedbackList.length}</p>
        <p><strong>Critical:</strong> ${criticalFeedback.length} | <strong>Normal:</strong> ${normalFeedback.length}</p>
        <hr>
        ${renderFeedbackSection('🚨 Critical Issues', criticalByCategory)}
        ${renderFeedbackSection('📝 Normal Feedback', normalByCategory)}
        <hr>
        <p><small>Generated: ${new Date().toLocaleString()}</small></p>
      `
    })
  } catch (error) {
    console.error('Failed to send weekly digest:', error)
  }
}
