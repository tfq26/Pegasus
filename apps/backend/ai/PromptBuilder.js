
import { classifyIntent } from './prompts/intent.js';
import { CORE_PERSONA, FAILURE_PROTOCOL, cleanResponse } from './prompts/core.js';
import { buildFetchingPrompt } from './prompts/fetching.js';
import { buildAnalysisPrompt, buildTitlePrompt, buildDisambiguationPrompt } from './prompts/processing.js';
import { buildVisualizationPrompt } from './prompts/visualization.js';

export class PromptBuilder {

  /**
   * Main Router: Builds the appropriate system prompt based on user intent and context.
   * @param {object} context - Contains dialect, schema, userMessage, etc.
   * @param {object} settings - Contains customInstructions, aiDetail, etc.
   */
  static buildQueryPrompt(context, settings = {}) {
    // 1. Determine Intent
    // If not explicitly provided, classify from the user message
    const intent = settings.intent || classifyIntent(context.userMessage || '', context);

    // 2. Start with Core Persona
    let prompt = CORE_PERSONA;

    // 3. Delegation based on Intent
    // If out-of-scope, force the strict guardrails and provide no tool context
    if (intent?.isOutOfScope) {
      prompt += `\n[ACTION: REJECT OUT-OF-SCOPE REQUEST]
The user's current message is detected as OUT-OF-SCOPE. 
You MUST apply the REFUSAL PROTOCOL defined in the CORE PERSONA.
Do not call any tools. Do not provide the joke, poem, or info requested.`;
      return prompt;
    }

    // NOTE: Even for 'visualization' or 'analysis', we first need to FETCH data.
    // So we route everything through buildFetchingPrompt, which handles the "how to get data" logic.
    prompt += buildFetchingPrompt(context, settings, intent);


    // 4. Append Universal Failure Protocol
    prompt += FAILURE_PROTOCOL;

    return prompt;
  }

  // --- Delegation Methods ---

  static buildAnalysisPrompt(question, results, query, schema) {
    return buildAnalysisPrompt(question, results, query, schema);
  }

  static buildVisualizationPrompt(originalPrompt, data, forceVisualization, dataProfile = null) {
    return buildVisualizationPrompt(originalPrompt, data, forceVisualization, dataProfile);
  }

  static buildTitlePrompt(messages) {
    return buildTitlePrompt(messages);
  }

  static buildDisambiguationPrompt(term, candidates) {
    return buildDisambiguationPrompt(term, candidates);
  }

  static cleanResponse(response, dialect) {
    return cleanResponse(response, dialect);
  }
}