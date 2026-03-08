# Pegasus Test Suite

This directory contains end-to-end tests for the Pegasus application using Playwright.

## Setup

1. Install dependencies (already done):
   ```bash
   bun add -D playwright @playwright/test
   ```

2. Install Playwright browsers:
   ```bash
   bunx playwright install
   ```

## Configuration

### Test Connection Strings

Update `tests/fixtures/test-connections.ts` with your actual test database credentials before running tests.

```typescript
export const testConnections = {
  mongodb: {
    atlas: {
      url: 'mongodb+srv://your-connection-string',
      // ...
    }
  }
}
```

## Running Tests

### Run all tests
```bash
bunx playwright test
```

### Run specific test file
```bash
bunx playwright test tests/database-connections.spec.ts
```

### Run specific test
```bash
bunx playwright test -g "should add MongoDB Atlas connection"
```

### Run tests in UI mode (interactive)
```bash
bunx playwright test --ui
```

### Run tests in headed mode (see browser)
```bash
bunx playwright test --headed
```

### Debug a specific test
```bash
bunx playwright test --debug -g "should add MongoDB Atlas connection"
```

## Test Structure

```
tests/
├── fixtures/
│   └── test-connections.ts    # Test connection configurations
├── helpers/
│   └── auth.ts                # Authentication and navigation helpers
├── database-connections.spec.ts  # Database connection tests
├── settings.spec.ts           # Settings page tests
└── README.md                  # This file
```

## Writing New Tests

1. Create a new `.spec.ts` file in the `tests/` directory
2. Import helpers from `tests/helpers/`
3. Use fixtures from `tests/fixtures/`
4. Follow the existing test patterns

Example:
```typescript
import { test, expect } from '@playwright/test';
import { login, navigateToDatabaseConnections } from './helpers/auth';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should do something', async ({ page }) => {
    // Your test code
  });
});
```

## Test Reports

After running tests, view the HTML report:
```bash
bunx playwright show-report
```

## CI/CD Integration

The tests are configured to run in CI environments. Set the `CI` environment variable to enable:
- Retries (2 attempts)
- Single worker
- No server reuse

## Troubleshooting

### Tests failing due to auth
- Make sure your WorkOS credentials are configured in `apps/backend/.env`
- Check that the auth flow redirects properly

### Connection tests failing
- Verify your test connection strings in `tests/fixtures/test-connections.ts`
- Ensure test databases are accessible from your machine
- Check network/firewall settings

### Timeouts
- Increase timeout in specific tests: `test.setTimeout(60000)`
- Or globally in `playwright.config.ts`

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Delete test data after tests complete
3. **Waits**: Use `waitForSelector` instead of `waitForTimeout` when possible
4. **Assertions**: Use Playwright's built-in assertions for better error messages
5. **Selectors**: Prefer `data-testid` attributes for stable selectors
