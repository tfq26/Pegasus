/**
 * Structured Logger Service
 * 
 * Provides standardized, level-based logging with support for metadata 
 * and request context (e.g. Request ID).
 */

class Logger {
    constructor() {
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        this.currentLevel = process.env.LOG_LEVEL || (process.env.PEGASUS_DEV_MODE === 'true' ? 'DEBUG' : 'INFO');
    }

    _shouldLog(level) {
        return this.levels[level] >= this.levels[this.currentLevel];
    }

    _format(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const requestId = meta.requestId ? `[${meta.requestId}] ` : '';
        const context = meta.context ? `[${meta.context}] ` : '';
        const metaStr = Object.keys(meta).length > 2 ? ` | ${JSON.stringify(this._sanitizeMeta(meta))}` : '';

        return `${timestamp} [${level}] ${requestId}${context}${message}${metaStr}`;
    }

    _sanitizeMeta(meta) {
        const { requestId, context, ...rest } = meta;
        return rest;
    }

    debug(message, meta = {}) {
        if (this._shouldLog('DEBUG')) {
            console.debug(this._format('DEBUG', message, meta));
        }
    }

    info(message, meta = {}) {
        if (this._shouldLog('INFO')) {
            console.info(this._format('INFO', message, meta));
        }
    }

    warn(message, meta = {}) {
        if (this._shouldLog('WARN')) {
            console.warn(this._format('WARN', message, meta));
        }
    }

    error(message, errorOrMeta = {}) {
        if (this._shouldLog('ERROR')) {
            let meta = errorOrMeta;
            let msg = message;

            if (errorOrMeta instanceof Error) {
                meta = { stack: errorOrMeta.stack };
                msg = `${message}: ${errorOrMeta.message}`;
            }

            console.error(this._format('ERROR', msg, meta));
        }
    }
}

export const logger = new Logger();
export default logger;
