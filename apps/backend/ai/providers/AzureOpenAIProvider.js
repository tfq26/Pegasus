import { AzureOpenAI } from "openai";

export class AzureOpenAIProvider {
    constructor(config) {
        this.config = config;
        // Azure OpenAI requires an endpoint, key, and apiVersion
        this.client = new AzureOpenAI({
            endpoint: config.endpoint,
            apiKey: config.apiKey,
            apiVersion: config.apiVersion || "2024-08-01-preview",
            deployment: config.deploymentId
        });
        this.deploymentName = config.deploymentId; // e.g. "gpt-4-deployment"
    }

    async generateContent(messages, options = {}) {
        try {
            const result = await this.client.chat.completions.create({
                model: this.deploymentName,
                messages: messages,
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature || 0.7
            });

            return result.choices[0].message.content;
        } catch (error) {
            console.error('[Azure OpenAI] Generation error:', error);
            throw error;
        }
    }

    async listModels() {
        // Since deployments vary by user setup, we might need them to specify the deployment name
        // For now returning generic placeholders that would map to their deployment config
        return [
            { id: 'azure-gpt-4', name: 'GPT-4 (Azure)', provider: 'azure' },
            { id: 'azure-gpt-35-turbo', name: 'GPT-3.5 Turbo (Azure)', provider: 'azure' }
        ];
    }
}
