# How to get Azure Credentials

To allow Pegasus to provision resources on your behalf, you need to create a **Service Principal**.

## Steps

1.  **Azure Portal**: Go to the [Azure Portal](https://portal.azure.com).
2.  **App Registrations**: Search for "App Registrations" and click **New Registration**.
    *   Name: `PegasusAutomation`
    *   Supported account types: `Accounts in this organizational directory only`
    *   Click **Register**.
3.  **Client ID & Tenant ID**: After registration, copy the **Application (client) ID** and **Directory (tenant) ID**.
4.  **Client Secret**:
    *   Go to **Certificates & secrets** -> **New client secret**.
    *   Add a description and set an expiration.
    *   **IMPORTANT**: Copy the **Value** (not the ID) immediately. You won't see it again.
5.  **Subscription ID**: Search for "Subscriptions" in the portal and copy your **Subscription ID**.
6.  **Permissions**:
    *   Go to your **Resource Group** (or create a new one).
    *   Go to **Access Control (IAM)** -> **Add role assignment**.
    *   Role: **Contributor**.
    *   Members: Select the `PegasusAutomation` app you just created.
    *   Click **Review + assign**.

Now you can paste these into the **Linked Accounts** tab in Pegasus!
