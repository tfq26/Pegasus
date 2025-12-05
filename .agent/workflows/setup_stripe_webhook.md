---
description: How to set up Stripe webhooks for local development
---

# Setting up Stripe Webhooks

## Local Development (using Stripe CLI)

1.  **Install Stripe CLI**:
    - **macOS (Homebrew)**: `brew install stripe/stripe-cli/stripe`
    - **Windows/Linux**: [Install Instructions](https://stripe.com/docs/stripe-cli)

2.  **Login**:
    ```bash
    stripe login
    ```

3.  **Forward Webhooks**:
    ```bash
    stripe listen --forward-to localhost:3000/webhook
    ```

4.  **Get Webhook Secret**:
    Copy the `whsec_...` secret from the terminal output.

5.  **Update .env**:
    Add to `apps/backend/.env`:
    ```env
    STRIPE_WEBHOOK_SECRET=whsec_...
    ```

6.  **Test**:
    ```bash
    stripe trigger checkout.session.completed
    ```
