import { VertexAI } from "@google-cloud/vertexai";

export class GCPVertexProvider {
    constructor(config) {
        this.config = config;
        this.vertex = new VertexAI({
            project: config.projectId,
            location: config.location || 'us-central1'
        });
    }

    async generateContent(messages, options = {}) {
        const modelId = options.model || 'gemini-1.5-pro-preview-0409';

        try {
            const generativeModel = this.vertex.getGenerativeModel({
                model: modelId,
                generationConfig: {
                    maxOutputTokens: options.maxTokens || 4096,
                    temperature: options.temperature || 0.7
                }
            });

            // Convert chat history format to Vertex format
            const contents = messages.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

            const response = await generativeModel.generateContent({
                contents: contents
            });

            const responseContent = await response.response;
            return responseContent.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('[GCP Vertex] Generation error:', error);
            throw error;
        }
    }

    async listModels() {
        return [
            { id: 'gemini-1.5-pro-preview-0409', name: 'Gemini 1.5 Pro (Vertex)', provider: 'gcp' },
            { id: 'gemini-1.0-pro-001', name: 'Gemini 1.0 Pro (Vertex)', provider: 'gcp' }
        ];
    }
}
