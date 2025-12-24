# How to get AWS Credentials

To allow Pegasus to deploy resources to your AWS account, you need to create an **IAM User** with programmatic access.

## Steps

1.  **AWS Console**: Sign in to the [AWS Management Console](https://console.aws.amazon.com).
2.  **IAM**: Search for "IAM" and go to **Users** -> **Create user**.
3.  **User Details**:
    *   User name: `PegasusAutomation`
    *   Click **Next**.
4.  **Permissions**:
    *   Select **Attach policies directly**.
    *   Search and select: `AmazonECS_FullAccess`, `AmazonEC2ReadOnlyAccess`.
    *   *Note: For production, we recommend scoped policies for specific clusters/VPCs.*
    *   Click **Next** -> **Create user**.
5.  **Access Keys**:
    *   Click on the newly created `PegasusAutomation` user.
    *   Go to **Security credentials** tab.
    *   Click **Create access key**.
    *   Select **Application running outside AWS**.
    *   Click **Next** -> **Create access key**.
6.  **Copy Credentials**:
    *   Copy the **Access key ID**.
    *   Copy the **Secret access key**.
    *   **IMPORTANT**: The Secret Key is only shown once. Download the `.csv` file if needed.
7.  **Region**: Identify your preferred region (e.g., `us-east-1`, `eu-west-1`) to use in Pegasus.

Now you can paste these into the **Linked Accounts** tab in Pegasus!
