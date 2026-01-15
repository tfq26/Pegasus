import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export class AWSBedrockProvider {
    constructor(config) {
        this.config = config;
        this.client = new BedrockRuntimeClient({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            }
        });
    }

    async generateContent(messages, options = {}) {
        const modelId = options.model || 'anthropic.claude-3-sonnet-20240229-v1:0';

        try {
            // Format for Claude 3 (Messages API)
            if (modelId.includes('claude-3')) {
                const payload = {
                    anthropic_version: "bedrock-2023-05-31",
                    max_tokens: options.maxTokens || 4096,
                    messages: messages.map(m => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: [{ type: 'text', text: m.content }]
                    })),
                    temperature: options.temperature || 0.7
                };

                const command = new InvokeModelCommand({
                    modelId: modelId,
                    contentType: "application/json",
                    accept: "application/json",
                    body: JSON.stringify(payload)
                });

                const response = await this.client.send(command);
                const responseBody = JSON.parse(new TextDecoder().decode(response.body));

                return responseBody.content[0].text;
            } else {
                // Fallback / Todo for other models (Titan, Llama)
                throw new Error(`Model ${modelId} not yet supported by AWS provider implementation`);
            }
        } catch (error) {
            console.error('[AWS Bedrock] Generation error:', error);
            throw error;
        }
    }

    async listModels() {
        // Static list for now, could use Foundation Models API later
        return [
            { id: 'anthropic.claude-3-sonnet-20240229-v1:0', name: 'Claude 3 Sonnet (AWS)', provider: 'aws' },
            { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku (AWS)', provider: 'aws' }
        ];
    }
}
