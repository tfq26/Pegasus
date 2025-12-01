const apiKey = process.env.GEMINI_API_KEY
const fs = require('fs')

if (!apiKey) {
    console.error("GEMINI_API_KEY not set in environment")
    process.exit(1)
}

async function listModels() {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        )

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        let output = "\n=== Available Gemini Models ===\n\n"

        if (data.models) {
            // Filter for models that support generateContent
            const contentModels = data.models.filter(m =>
                m.supportedGenerationMethods?.includes('generateContent')
            )

            output += `Found ${contentModels.length} models that support generateContent:\n\n`

            contentModels.forEach(model => {
                output += `Model: ${model.name}\n`
                output += `  Display Name: ${model.displayName}\n`
                output += `  Description: ${model.description || 'N/A'}\n`
                output += `  Input Token Limit: ${model.inputTokenLimit || 'N/A'}\n`
                output += `  Output Token Limit: ${model.outputTokenLimit || 'N/A'}\n`
                output += '---\n'
            })

            // Save to file
            fs.writeFileSync('available-models.txt', output)
            console.log("Models list saved to available-models.txt")
            console.log("\nRecommended models for generateContent:")
            console.log("  - gemini-2.0-flash-exp")
            console.log("  - gemini-1.5-flash")
            console.log("  - gemini-1.5-pro")
        } else {
            console.log("No models found")
        }
    } catch (error) {
        console.error("Error listing models:", error.message)
    }
}

listModels()
