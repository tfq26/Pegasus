import cron from 'node-cron'
import { getUnnotifiedFeedback, markAsNotified } from '../services/feedback.js'
import { sendWeeklyDigest } from '../services/email.js'

export function initializeWeeklyDigest() {
    // Run every Sunday at 6:00 PM (18:00)
    // Cron format: minute hour day-of-month month day-of-week
    cron.schedule('0 18 * * 0', async () => {
        console.log('Running weekly feedback digest...')

        try {
            const feedback = await getUnnotifiedFeedback()

            if (feedback.length > 0) {
                await sendWeeklyDigest(feedback)
                const ids = feedback.map((f) => f.id)
                await markAsNotified(ids)
                console.log(`Weekly digest sent with ${feedback.length} items`)
            } else {
                console.log('No new feedback to send in digest')
            }
        } catch (error) {
            console.error('Error sending weekly digest:', error)
        }
    })

    console.log('Weekly digest cron job initialized (Sundays at 6:00 PM)')
}
