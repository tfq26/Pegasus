
export class LogCollector {
    private buffer: string[] = [];
    private maxLines: number;
    private originalMethods: Record<string, any> = {};

    constructor(maxLines: number = 100) {
        this.maxLines = maxLines;
    }

    start() {
        const methods = ['log', 'error', 'warn', 'info'];
        methods.forEach(method => {
            this.originalMethods[method] = (console as any)[method];
            (console as any)[method] = (...args: any[]) => {
                const message = this.formatArgs(args);
                this.addToBuffer(`[${method.toUpperCase()}] ${message}`);
                this.originalMethods[method].apply(console, args);
            };
        });
    }

    stop() {
        Object.keys(this.originalMethods).forEach(method => {
            (console as any)[method] = this.originalMethods[method];
        });
    }

    private formatArgs(args: any[]): string {
        return args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return '[Circular Object]';
                }
            }
            return String(arg);
        }).join(' ');
    }

    private addToBuffer(line: string) {
        const timestamp = new Date().toISOString();
        this.buffer.push(`${timestamp} ${line}`);
        if (this.buffer.length > this.maxLines) {
            this.buffer.shift();
        }
    }

    getLogs(): string {
        return this.buffer.join('\n');
    }

    clear() {
        this.buffer = [];
    }
}
