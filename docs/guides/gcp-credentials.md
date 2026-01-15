# How to Connect Your Google Cloud Account

Connecting your Google Cloud account to Pegasus takes just a few clicks. You'll be redirected to Google's secure login page to authorize access.

---

## What You'll Need
- A Google Cloud account with a project
- Billing enabled on your project (required for resource creation)

---

## Steps to Connect

### 1. Open Cloud Settings
Go to **Settings** → **Cloud Infrastructure** in Pegasus.

### 2. Click Connect
Find the **Google Cloud** card and click **Connect Account**.

### 3. Sign In with Google
A popup will open with Google's login page:
- Enter your Google account email
- Complete any two-factor authentication if prompted

### 4. Authorize Pegasus
Review the permissions Pegasus is requesting:
- **View and manage your Google Cloud resources** — allows Pegasus to create and view resources
- Click **Allow** to continue

### 5. Select Your Project (if prompted)
If you have multiple GCP projects, select the one you want Pegasus to manage.

### 6. Done!
The popup will close and your Google Cloud account will show as **Connected** in Pegasus.

---

## What Can Pegasus Access?

After connecting, Pegasus can:
- ✅ View your projects and resources
- ✅ Create resources like Cloud Storage buckets, Firestore databases, and Vertex AI
- ✅ Monitor resource status
- ✅ Delete resources you create through Pegasus

Pegasus **cannot**:
- ❌ Access your Gmail, Drive, or other personal Google services
- ❌ Make purchases without your approval
- ❌ Access projects you don't grant permission for

---

## Disconnecting Your Account

To remove Pegasus access:
1. Go to **Settings** → **Cloud Infrastructure**
2. Click the **⋮** menu on the Google Cloud card
3. Select **Disconnect**

You can also revoke access directly in Google:
1. Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
2. Find "Pegasus" in the list
3. Click **Remove Access**

---

## Troubleshooting

**Popup was blocked?**
- Allow popups for Pegasus in your browser settings
- Try the connection again

**"This app isn't verified" warning?**
- This is normal during beta testing
- Click **Advanced** → **Go to Pegasus (unsafe)** to continue
- Your data is still secure — this just means Google hasn't reviewed the app yet

**"Access Denied" errors?**
- Make sure billing is enabled on your GCP project
- Verify you have Editor or Owner permissions on the project

**Connection failed?**
- Try disconnecting and reconnecting
- Make sure you have at least one GCP project

---

Need help? Contact support@pegasus.ai
