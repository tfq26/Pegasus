/**
 * Centralized Error Codes for the Application.
 * Matches definitions in docs/ERROR_CODES.md
 */

export const ErrorCodes = {
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
    MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
    INVALID_QUERY: 'INVALID_QUERY',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export const ErrorHandlers = {
    [ErrorCodes.QUOTA_EXCEEDED]: {
        title: 'Limit Reached',
        actionLabel: 'Upgrade Plan',
        redirect: '/profile',
        severity: 'warning'
    },
    [ErrorCodes.UNAUTHORIZED]: {
        title: 'Session Expired',
        actionLabel: 'Log In',
        redirect: '/login',
        severity: 'error'
    },
    [ErrorCodes.CONNECTION_FAILED]: {
        title: 'Connection Error',
        actionLabel: 'Check Settings',
        redirect: null,
        severity: 'error'
    },
    [ErrorCodes.AI_SERVICE_ERROR]: {
        title: 'AI Service Error',
        actionLabel: 'Retry',
        redirect: null,
        severity: 'error'
    },
    [ErrorCodes.MODEL_UNAVAILABLE]: {
        title: 'Model Unavailable',
        actionLabel: 'Check Settings',
        redirect: '/settings',
        severity: 'warning'
    },
    [ErrorCodes.INVALID_QUERY]: {
        title: 'Invalid Query',
        actionLabel: 'Go Back',
        redirect: null,
        severity: 'error'
    },
    [ErrorCodes.RESOURCE_NOT_FOUND]: {
        title: 'Not Found',
        actionLabel: 'Go Back',
        redirect: null,
        severity: 'error'
    },
    [ErrorCodes.UNKNOWN_ERROR]: {
        title: 'Error',
        actionLabel: 'Retry',
        redirect: null,
        severity: 'error'
    }
} as const;
