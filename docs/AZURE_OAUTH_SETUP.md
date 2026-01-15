# Azure OAuth Setup Guide

This guide walks you through registering Pegasus as an OAuth application with Azure AD to enable cloud resource management.

## Prerequisites
- An Azure account with permissions to create App Registrations
- Access to Azure Portal

## Step 1: Register App in Azure AD

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**

### Registration Details:
- **Name**: `Pegasus Cloud Manager` (or your preferred name)
- **Supported account types**: 
  - For multi-tenant (recommended): **Accounts in any organizational directory (Any Azure AD directory - Multitenant)**
  - For single tenant: **Accounts in this organizational directory only**
- **Redirect URI**: 
  - Platform: **Web**
  - URI: `http://localhost:3000/api/cloud-auth/azure/callback`
  - For production: `https://your-domain.com/api/cloud-auth/azure/callback`

4. Click **Register**

## Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Azure Service Management**
4. Select **Delegated permissions**
5. Check **user_impersonation**
6. Click **Add permissions**
7. (Optional) Click **Grant admin consent** if you have admin rights

### Required Scopes:
- `https://management.azure.com/user_impersonation` - Allows Pegasus to manage Azure resources on behalf of the user
- `offline_access` - Enables refresh tokens
- `openid` - Basic user info
- `profile` - User profile info

## Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description: `Pegasus Backend Secret`
4. Set expiration (recommended: 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately (you won't be able to see it again)

## Step 4: Get Your Credentials

From the **Overview** page of your app registration, copy:

- **Application (client) ID** → This is your `AZURE_OAUTH_CLIENT_ID`
- **Directory (tenant) ID** → This is your `AZURE_OAUTH_TENANT` (or use `common` for multi-tenant)
- **Client secret value** (from Step 3) → This is your `AZURE_OAUTH_CLIENT_SECRET`

## Step 5: Update Environment Variables

Add to your `apps/backend/.env` file:

```bash
AZURE_OAUTH_CLIENT_ID=<your-client-id>
AZURE_OAUTH_CLIENT_SECRET=<your-client-secret>
AZURE_OAUTH_REDIRECT_URI=http://localhost:3000/api/cloud-auth/azure/callback
AZURE_OAUTH_TENANT=common
```

## Step 6: Test the OAuth Flow

1. Restart your backend server
2. Navigate to Settings → Cloud Infrastructure in Pegasus
3. Click "Connect Account" on the Azure card
4. You should be redirected to Microsoft login
5. After authorizing, you should be redirected back to Pegasus

## Troubleshooting

### "AADSTS50011: The reply URL specified in the request does not match"
- Verify the redirect URI in Azure AD matches exactly what's in your `.env`
- Check for trailing slashes

### "AADSTS65001: The user or administrator has not consented"
- Make sure you added the `user_impersonation` permission
- Try granting admin consent in the API permissions page

### "Invalid client secret"
- The client secret may have expired
- Create a new client secret and update your `.env`

## Security Notes

- **Never commit** your client secret to version control
- Use different app registrations for dev/staging/production
- Rotate client secrets regularly
- Monitor the app's sign-in logs in Azure AD for suspicious activity

## Next Steps

Once Azure OAuth is working:
1. Test subscription listing
2. Implement resource provisioning
3. Add AWS and GCP OAuth flows
