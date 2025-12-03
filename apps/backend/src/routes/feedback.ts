import { Router } from 'express'
import { createFeedback, type FeedbackData } from '../services/feedback.js'
import { sendCriticalFeedbackEmail } from '../services/email.js'

const router = Router()

router.post('/feedback', async (req, res) => {
    try {
        const feedbackData: FeedbackData = {
            userEmail: req.body.userEmail,
            featureCategory: req.body.featureCategory,
            customFeature: req.body.customFeature,
            issueType: req.body.issueType,
            description: req.body.description,
            browserInfo: req.body.browserInfo,
            isUrgent: req.body.isUrgent || false
        }

        // Validate required fields
        if (!feedbackData.featureCategory || !feedbackData.issueType || !feedbackData.description) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        const { feedback, priority } = await createFeedback(feedbackData)

        // Send immediate email for critical feedback
        if (priority === 'critical') {
            await sendCriticalFeedbackEmail(feedback)
        }

        res.json({
            success: true,
            message: 'Feedback submitted successfully',
            priority
        })
    } catch (error) {
        console.error('Error submitting feedback:', error)
        res.status(500).json({ error: 'Failed to submit feedback' })
    }
})

export default router
