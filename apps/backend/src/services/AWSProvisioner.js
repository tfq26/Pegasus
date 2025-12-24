import { ECSClient, RunTaskCommand, DescribeTasksCommand } from "@aws-sdk/client-ecs";
import { EC2Client, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } from "@aws-sdk/client-ec2";

export class AWSProvisioner {
    /**
     * Provisions a SurrealDB instance on AWS ECS Fargate.
     */
    async provisionECS(credentials, config) {
        const { accessKeyId, secretAccessKey, region } = credentials;
        const { clusterName, taskDefinitionName, securityGroupId, subnetId } = config;

        try {
            console.log(`[AWSProvisioner] Authenticating with AccessKeyId: ${accessKeyId}`);

            const ecsClient = new ECSClient({
                region: region || "us-east-1",
                credentials: {
                    accessKeyId,
                    secretAccessKey
                }
            });

            const ec2Client = new EC2Client({
                region: region || "us-east-1",
                credentials: {
                    accessKeyId,
                    secretAccessKey
                }
            });

            // 1. Resolve Networking (if not provided)
            let finalSubnetId = subnetId;
            let finalSecurityGroupId = securityGroupId;

            if (!finalSubnetId) {
                const subnets = await ec2Client.send(new DescribeSubnetsCommand({}));
                finalSubnetId = subnets.Subnets[0].SubnetId;
            }

            if (!finalSecurityGroupId) {
                const sgs = await ec2Client.send(new DescribeSecurityGroupsCommand({}));
                finalSecurityGroupId = sgs.SecurityGroups[0].GroupId;
            }

            console.log(`[AWSProvisioner] Running task in Cluster: ${clusterName}, Subnet: ${finalSubnetId}`);

            // 2. Run Task
            const runTask = await ecsClient.send(new RunTaskCommand({
                cluster: clusterName || "default",
                taskDefinition: taskDefinitionName || "surrealdb",
                launchType: "FARGATE",
                networkConfiguration: {
                    awsvpcConfiguration: {
                        subnets: [finalSubnetId],
                        securityGroups: [finalSecurityGroupId],
                        assignPublicIp: "ENABLED"
                    }
                },
                overrides: {
                    containerOverrides: [
                        {
                            name: "surrealdb",
                            command: ["start", "--user", "root", "--pass", "root", "--bind", "0.0.0.0:8000"]
                        }
                    ]
                }
            }));

            if (runTask.failures && runTask.failures.length > 0) {
                throw new Error(`Task start failed: ${runTask.failures[0].reason}`);
            }

            const taskArn = runTask.tasks[0].taskArn;
            console.log(`[AWSProvisioner] Task started. ARN: ${taskArn}`);

            // 3. Wait for IP (Simplified polling for 15s)
            await new Promise(res => setTimeout(res, 15000));

            const describe = await ecsClient.send(new DescribeTasksCommand({
                cluster: clusterName || "default",
                tasks: [taskArn]
            }));

            // In a real scenario, we'd look up the ENI to find the public IP.
            // For now, we returns the ARN and instructions as it's more complex to fetch public IP immediately.
            // But let's try to be helpful. 

            return {
                ok: true,
                taskArn: taskArn,
                config: {
                    protocol: 'ws',
                    host: "PENDING_AWS_IP", // Fetching public IP for Fargate requires multi-step ENI lookup
                    port: 8000,
                    namespace: 'test',
                    database: 'test',
                    username: 'root',
                    password: 'root',
                    url: "ws://CHECK_AWS_CONSOLE:8000/rpc"
                },
                message: "ECS Task started successfully. It may take a minute for the public IP to be assigned."
            };
        } catch (e) {
            console.error('[AWSProvisioner] ECS deployment failed:', e);
            throw new Error(`AWS deployment failed: ${e.message}`);
        }
    }
}

export const awsProvisioner = new AWSProvisioner();
