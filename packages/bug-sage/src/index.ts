
/* eslint-disable no-undef */
declare const window: any;
declare const navigator: any;
import { LogCollector } from "./LogCollector";

export interface BugReportOptions {
    error?: Error | any;
    userNotes?: string;
    metadata?: Record<string, any>;
    endpoint?: string;
}

export class BugSage {
    private collector: LogCollector;
    private endpoint: string;

    constructor(options: { maxLogs?: number; endpoint?: string } = {}) {
        this.collector = new LogCollector(options.maxLogs || 200);
        this.endpoint = options.endpoint || '/support/analyze';
        this.collector.start();
    }

    async report(options: BugReportOptions) {
        const logs = this.collector.getLogs();
        const systemInfo = this.getSystemInfo();

        const isBrowser = typeof window !== 'undefined';
        const metadataWithInfo: any = {
            ...options.metadata,
            ...systemInfo,
            url: isBrowser ? (window as any).location.href : 'node-server'
        };

        const payload = {
            error: options.error ? {
                message: options.error.message,
                stack: options.error.stack,
                name: options.error.name,
                code: options.error.code
            } : null,
            userNotes: options.userNotes || "",
            logs,
            metadata: metadataWithInfo,
            timestamp: new Date().toISOString()
        };

        console.info("[BugSage] Analyzing bug report...");

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to send bug report: ${response.statusText}`);
            }

            return await response.json();
        } catch (e) {
            console.error("[BugSage] Error reporting failed:", e);
            throw e;
        }
    }

    private getSystemInfo() {
        if (typeof window !== 'undefined') {
            const win = window as any;
            const nav = navigator as any;
            return {
                userAgent: nav.userAgent,
                language: nav.language,
                screen: win.screen ? `${win.screen.width}x${win.screen.height}` : 'unknown',
                platform: nav.platform,
                isBrowser: true
            };
        }
        return {
            platform: process.platform,
            nodeVersion: process.version,
            arch: process.arch,
            isBrowser: false
        };
    }

    getCollector() {
        return this.collector;
    }
}
