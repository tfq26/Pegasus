# How to Connect Your AWS Account

Connecting your AWS account to Pegasus requires creating an Access Key. This guide walks you through the simple process.

---

## What You'll Need
- An AWS account
- Permission to create IAM users (or ask your admin)

---

## Steps to Connect

### 1. Sign in to AWS
Go to [console.aws.amazon.com](https://console.aws.amazon.com) and sign in.

### 2. Open IAM
- In the search bar at the top, type **IAM**
- Click on **IAM** in the results

### 3. Create a New User
1. Click **Users** in the left sidebar
2. Click **Create user**
3. Enter a name: `pegasus-manager`
4. Click **Next**

### 4. Add Permissions
1. Select **Attach policies directly**
2. Search for and check these policies:
   - `AmazonS3FullAccess`
   - `AmazonDynamoDBFullAccess`
3. Click **Next** → **Create user**

### 5. Create Access Key
1. Click on your new `pegasus-manager` user
2. Go to the **Security credentials** tab
3. Scroll to **Access keys** and click **Create access key**
4. Select **Application running outside AWS**
5. Click **Next** → **Create access key**

### 6. Copy Your Credentials
You'll see two values:

| Field | What it looks like |
|-------|-------------------|
| **Access key ID** | `AKIAIOSFODNN7EXAMPLE` |
| **Secret access key** | `wJalrXUtnFEMI/K7MDENG...` |

> ⚠️ **Important**: The Secret Access Key is only shown once! Click **Download .csv file** to save it.

### 7. Enter in Pegasus
1. Go to **Settings** → **Cloud Infrastructure** in Pegasus
2. Click **Connect Account** on the AWS card
3. Enter your Access Key ID and Secret Access Key
4. Select your preferred region (e.g., `us-east-1`)
5. Click **Connect**

---

## What Can Pegasus Access?

After connecting, Pegasus can:
- ✅ Create S3 buckets for file storage
- ✅ Create DynamoDB tables for data
- ✅ View and manage resources you create through Pegasus

Pegasus **cannot**:
- ❌ Access resources beyond the permissions you granted
- ❌ Make purchases (AWS charges apply to your account)
- ❌ Access other AWS accounts

---

## Disconnecting Your Account

To remove Pegasus access:
1. Go to **Settings** → **Cloud Infrastructure**
2. Click the **⋮** menu on the AWS card
3. Select **Disconnect**

For extra security, also delete the Access Key in AWS:
1. Go to **IAM** → **Users** → `pegasus-manager`
2. Click **Security credentials**
3. Find the Access Key and click **Deactivate** then **Delete**

---

## Troubleshooting

**"Invalid credentials" error?**
- Double-check you copied the full Access Key ID and Secret
- Make sure there are no extra spaces

**"Access Denied" when viewing resources?**
- The IAM user may need additional permissions
- Add more policies like `AmazonEC2ReadOnlyAccess`

**Forgot your Secret Access Key?**
- You can't retrieve it, but you can create a new Access Key
- Delete the old one and repeat Step 5-6

---

Need help? Contact support@pegasus.ai
