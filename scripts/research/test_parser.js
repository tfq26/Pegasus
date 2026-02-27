
const content = `The following portfolio goals are currently marked as 'High' priority:

Results: [
  {
    "id": 1,
    "client_id": 1,
    "goal_name": "Retirement Corpus",
    "target_amount": 50000000,
    "current_value": 4582450,
    "target_date": "2040-01-01",
    "monthly_sip": 45000,
    "priority": "High",
    "status": "Active"
  },
  {
    "id": 2,
    "client_id": 1,
    "goal_name": "Child Education",
    "target_amount": 10000000,
    "current_value": 850000,
    "target_date": "2035-06-01",
    "monthly_sip": 15000,
    "priority": "High",
    "status": "Active"
  },
  {
    "id": 4,
    "client_id": 2,
    "goal_name": "Retirement Fund",
    "target_amount": 30000000,
    "current_value": 2150000,
    "target_date": "2045-01-01",
    "monthly_sip": 30000,
    "priority": "High",
    "status": "Active"
  },
  {
    "id": 6,
    "client_id": 3,
    "goal_name": "Early Retirement",
    "target_amount": 80000000,
    "current_value": 12500000,
    "target_date": "2036-01-01",
    "monthly_sip": 100000,
    "priority": "High",
    "status": "Active"
  },
  {
    "id": 7,
    "client_id": 4,
    "goal_name": "Emergency Fund",
    "target_amount": 1000000,
    "current_value": 750000,
    "target_date": "2025-06-01",
    "monthly_sip": 20000,
    "priority": "High",
    "status": "Active"
  }
]`;

function parse(content) {
    const lowerContent = content.toLowerCase()

    // Find the best marker for JSON results
    let resultsIndex = -1
    const markers = ['results:', 'result:', 'data:']
    for (const marker of markers) {
        const idx = lowerContent.lastIndexOf(marker)
        if (idx > resultsIndex) resultsIndex = idx
    }

    let textBefore = content
    let potentialJson = ''
    let startIndexOffset = 0

    console.log('resultsIndex:', resultsIndex);

    if (resultsIndex !== -1) {
        // We found a tag!
        textBefore = content.substring(0, resultsIndex).trim()
        const afterResults = content.substring(resultsIndex)

        // Find the first occurrence of [ or { after the marker
        const startMatch = afterResults.match(/(\[|\{)/)
        if (startMatch) {
            startIndexOffset = startMatch.index
            potentialJson = afterResults.substring(startIndexOffset)
        }
    } else {
        // FALLBACK
        const allMatches = content.match(/(\[|\{)/g)
        const lastChar = allMatches ? allMatches[allMatches.length - 1] : null
        if (lastChar) {
            const lastIndex = content.lastIndexOf(lastChar)
            if (content.length - lastIndex > 10) {
                textBefore = content.substring(0, lastIndex).trim()
                potentialJson = content.substring(lastIndex)
                startIndexOffset = 0
            }
        }
    }

    console.log('potentialJson preview:', potentialJson.substring(0, 50));

    if (potentialJson) {
        const startChar = potentialJson[0]
        const endChar = startChar === '[' ? ']' : '}'

        // Find the balancing end character
        let balance = 0
        let endIndex = -1

        for (let i = 0; i < potentialJson.length; i++) {
            const char = potentialJson[i]
            if (char === startChar) balance++
            else if (char === endChar) {
                balance--
                if (balance === 0) {
                    endIndex = i
                    break
                }
            }
        }

        console.log('endIndex:', endIndex);

        if (endIndex !== -1) {
            let jsonStr = potentialJson.substring(0, endIndex + 1)
            const textAfter = potentialJson.substring(endIndex + 1).trim()

            try {
                // Clean up potential markdown wrappers
                let cleanJson = jsonStr.replace(/^```json\s*|\s*```$/g, '').trim()
                const json = JSON.parse(cleanJson)

                return {
                    textBefore,
                    textAfter,
                    results: json,
                    hasResults: true
                }
            } catch (e) {
                console.log('JSON Parse Error:', e.message);
            }
        }
    }

    return { textBefore: content, textAfter: '', hasResults: false }
}

const result = parse(content);
console.log('Result hasResults:', result.hasResults);
console.log('Result results type:', Array.isArray(result.results) ? 'Array' : typeof result.results);
if (Array.isArray(result.results)) {
    console.log('Result results length:', result.results.length);
    console.log('First result keys:', Object.keys(result.results[0]));
}
