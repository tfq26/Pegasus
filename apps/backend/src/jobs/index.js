import { initializeWeeklyDigest } from './weeklyDigest.js';
import { initializeQueryArchival } from './archiveQueries.js';
import { initializeChatArchival } from './archiveChats.js';

export function startAllJobs() {
    console.log('[Jobs] Starting background cron jobs...');

    initializeWeeklyDigest();
    initializeQueryArchival();
    initializeChatArchival();

    console.log('[Jobs] All jobs scheduled.');
}
