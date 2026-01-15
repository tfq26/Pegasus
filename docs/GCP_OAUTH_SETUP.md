# Google Cloud Platform (GCP) OAuth Setup Guide

This guide walks you through registering Pegasus as an OAuth application with GCP to enable cloud resource management.

## Prerequisites
- A Google Cloud account with permissions to manage projects and OAuth
- Access to [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create a Project (Optional)
If you don't have a project yet, create one in the GCP Console.

## Step 2: Configure OAuth Consent Screen
1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select **External** (unless you are part of a Google Workspace and want limited access)
3. Fill in the required app information (**App name**: `Pegasus`)
4. Add the following scopes:
   - `https://www.googleapis.com/auth/cloud-platform` (Required for managing resources)
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

## Step 3: Create Credentials
1. Navigate to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. **Application type**: `Web application`
4. **Name**: `Pegasus Backend`
5. **Authorized redirect URIs**:
   - `http://localhost:3000/api/cloud-auth/gcp/callback`
   - (For production: `https://your-domain.com/api/cloud-auth/gcp/callback`)
6. Click **Create**

## Step 4: Get Your Credentials
A dialog will show your **Client ID** and **Client Secret**. Copy these values.

## Step 5: Update Environment Variables
Add to your `apps/backend/.env` file:

```bash
GCP_OAUTH_CLIENT_ID=<your-client-id>
GCP_OAUTH_CLIENT_SECRET=<your-client-secret>
GCP_OAUTH_REDIRECT_URI=http://localhost:3000/api/cloud-auth/gcp/callback
```

## Step 6: Enable Required APIs
Ensure the following APIs are enabled in your GCP project:
- Cloud Resource Manager API
- Compute Engine API (for resource management)
- Vertex AI API (if using AI features)

---
Once configured, you can connect your GCP account in **Settings → Cloud Infrastructure**.
