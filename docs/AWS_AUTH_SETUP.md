# Amazon Web Services (AWS) Connection Guide

This guide explains how to connect your AWS account to Pegasus.

## Connection Options

Pegasus supports two main ways to connect AWS:
1. **IAM User Credentials** (Recommended for dev)
2. **Cross-Account IAM Role** (Recommended for production)

### IAM User Credentials Setup

1. Log in to your [AWS Management Console](https://console.aws.amazon.com/)
2. Navigate to **IAM** → **Users**
3. Click **Create user** (e.g., `pegasus-manager`)
4. **Attach policies directly**:
   - `AmazonEC2FullAccess` (or specific permissions for ECS/Lambda)
   - `AmazonDynamoDBFullAccess`
   - `AmazonS3FullAccess`
   - `AmazonBedrockFullAccess` (if using AI)
5. Under **Security credentials**, click **Create access key**
6. Select **Application running outside AWS**
7. Copy the **Access Key ID** and **Secret Access Key**

## Step 2: Configure Backend
For development, you can add these variables to your `apps/backend/.env` (though the UI flow will eventually handle this via the frontend):

```bash
AWS_OAUTH_REDIRECT_URI=http://localhost:3000/api/cloud-auth/aws/callback
```

## Step 3: Connect in Pegasus
1. Navigate to **Settings → Cloud Infrastructure**
2. Click **Connect Account** on the AWS card
3. A popup will appear. In this beta version, the popup simulates a successful connection.
4. Future updates will allow you to paste your Access/Secret keys directly into this popup.

---
Once connected, Pegasus will use these credentials to provision resources in your default AWS region (usually `us-east-1`).
