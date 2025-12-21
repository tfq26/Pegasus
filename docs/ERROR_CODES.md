# Application Error Codes & Handling

This document serves as the central registry for application error codes. Both Backend and Frontend should adhere to these codes to ensure consistent user experience and error handling.

## System Codes

| Code | Status | Description | User Message | Frontend Action |
|------|--------|-------------|--------------|-----------------|
| `QUOTA_EXCEEDED` | 403 | User has exceeded their monthly AI token limit (Free: 100k, Pro: 900k). | "Usage limit exceeded. Please upgrade or contact support." | **Show Block Modal**: Prevent further actions and offer "Upgrade to Pro" button redirecting to `/profile`. |
| `UNAUTHORIZED` | 401 | User session is invalid or expired. | "Your session has expired." | **Redirect**: Send user to `/login`. |
| `CONNECTION_FAILED` | 400/500 | Failed to connect to the user's database. | "Could not connect to database." | **Show Status**: Highlight connection indicator in red, prompt to check credentials. |
| `AI_SERVICE_ERROR` | 500 | Upstream AI provider (Gemini/OpenAI) returned an error. | "AI service is temporarily unavailable." | **Retry/Toast**: Allow user to retry, show toast notification. |
| `MODEL_UNAVAILABLE` | 503 | The specific AI model requested is overloaded or deprecated. | "The selected model is currently unavailable." | **Process**: Suggest switching to a different model in settings. |
| `INVALID_QUERY` | 400 | The generated or user query is invalid syntax. | "The query could not be executed." | **Show Error Panel**: Display the raw error execution message for debugging. |
| `RESOURCE_NOT_FOUND` | 404 | The requested entity (Chat, Connection, File) was not found. | "Resource not found." | **Redirect/List**: Redirect to the main list or dashboard. |
| `UNKNOWN_ERROR` | 500 | Fallback for unhandled exceptions. | "Something went wrong." | **Toast**: Show generic error message. |

## Implementation Guide

### Backend
Return errors in this JSON format:
```json
{
  "error": "Human readable message",
  "code": "ERROR_CODE_CONSTANT",
  "details": { ... } // Optional
}
```

### Frontend
Check `response.code` to determine the specific UI reaction (e.g., opening a modal vs showing a toast).
