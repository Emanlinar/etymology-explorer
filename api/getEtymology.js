// api/getEtymology.js

export default async function handler(request, response) {
    // Get the 'word' from the query parameter sent by the frontend
    // Vercel uses standard URL objects for request details.
    const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const word = searchParams.get('word');

    if (!word) {
        return response.status(400).json({ error: "Word parameter is required" });
    }

    // Access the API key from Vercel Environment Variables
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        console.error("Gemini API key is not set in environment variables on the server.");
        return response.status(500).json({ error: "API key not configured on server." });
    }

    // The detailed prompt for Gemini API (ensure this matches the one you want to use)
    const prompt = `For the word '${word}', provide its definition, an example sentence, and a detailed etymology.
The etymology should include a narrative summary.
Also, provide a structured lineage for a visual diagram. The lineage should be an array of objects, each representing a significant stage in the word's history from its earliest known roots to the modern form.
Each stage must have:
- 'id': A unique ID (e.g., 'apple_OldEnglish', '-ment_OldFrenchSuffix', 'scala_Latin').
- 'word': The word form (e.g., "apple", "-ment", "scala"). 
    - For suffixes, clearly denote them (e.g., "-suffix").
    - CRITICAL: For the 'word' field, provide the most common or simplified spelling/representation. Avoid specialized phonetic or linguistic notations (like Proto-Indo-European laryngeals h₁, h₂, h₃, or asterisks for reconstructed forms unless the asterisk is standard like *bher-). Such details, if essential, should be in 'short_definition'.
    - CRITICAL: Ensure the 'word' field contains only a SINGLE primary word form, not multiple forms separated by slashes or other delimiters (e.g., not 'form1/form2'). Choose the most representative form.
- 'short_definition': A brief definition. For suffixes, explain their function (e.g., "suffix forming nouns of action").
- 'language_origin': For language_origin, provide the specific language and its stage (e.g., 'Old English', 'Classical Latin', 'Ancient Greek').
- 'approx_period': The approx_period should then be purely temporal (e.g., 'c. 1200', '8th century BCE', '4th-1st c. BCE') and should NOT repeat the language name if already specified in language_origin.
- 'parent_ids': Array of parent 'id's. Empty for roots.
- 'combination_type': One of 'EVOLUTION', 'COMBINATION_CONTEMPORARY', 'PHRASE_FORMATION'.

CRITICAL FOR STAGED COMBINATIONS (e.g., base word evolution then affixation):
If '${word}' (or an intermediate word) is formed by combining a base word with an affix (e.g., a suffix like "-ing" added to "scale", where "scale" itself evolved from "scala"), structure the lineage to reflect this timing precisely.
Example for "scaling" from "scala" + "-ing":
1. Include "scala" with its own history (e.g., as a root or evolving from earlier forms).
2. Show "scala" evolving to "scale" (parent_id of "scale" would be the 'id' of "scala", combination_type 'EVOLUTION').
3. Include the suffix "-ing" as a separate node in the lineage (e.g., id: "-ing_suffix", word: "-ing"). This "-ing" node should be structured so it appears in the visual path *at the historical stage and level where "scale" exists and is ready for combination*. If "-ing" has its own prior etymology, that can be shown, but its point of entry as a combinable element with "scale" is key. Ensure its 'level' in the visual hierarchy would align it correctly for combination with 'scale'.
4. The word "scaling" (or an intermediate combined form like "scale-ing" if appropriate before the final modern word) must then list the 'id' of "scale" AND the 'id' of "-ing_suffix" in its 'parent_ids'. Its 'combination_type' must be 'COMBINATION_CONTEMPORARY'.
The goal is to visually introduce an affix (like "-ing") into the etymological path only when it historically combines with the (potentially evolved) base word. The 'level' of the affix node and the evolved base node should allow them to be presented as contemporaries for the combination.

Ensure the modern word ('${word}') is the final item.
The lineage should include all key intermediate forms, sources, and significant affixes.
If the word is an acronym or initialism, explain its components.
Ensure all text provided (definitions, origins, periods) does not contain asterisks.
Parents in 'parent_ids' for a 'COMBINATION_CONTEMPORARY' node must be from the same historical level/period to be visually accurate.`;
            
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "word_queried": { "type": "STRING" },
            "definition": { "type": "STRING" },
            "example_sentence": { "type": "STRING" },
            "etymology_summary": { "type": "STRING" },
            "lineage": {
              "type": "ARRAY",
              "description": "Array of words/morphemes in the etymological lineage.",
              "items": {
                "type": "OBJECT",
                "properties": {
                  "id": { "type": "STRING", "description": "A unique ID for this stage." },
                  "word": { "type": "STRING", "description": "The word or morpheme form (e.g., 'apple', '-ment')." },
                  "short_definition": { "type": "STRING", "description": "Brief definition or function." },
                  "language_origin": { "type": "STRING", "description": "Language of origin." },
                  "approx_period": { "type": "STRING", "description": "Approximate time period." },
                  "parent_ids": {
                    "type": "ARRAY",
                    "description": "IDs of immediate parent(s). Empty for roots.",
                    "items": { "type": "STRING" }
                  },
                  "combination_type": {
                    "type": "STRING",
                    "enum": ["EVOLUTION", "COMBINATION_CONTEMPORARY", "PHRASE_FORMATION"],
                    "description": "How this form was derived."
                  }
                },
                "required": ["id", "word", "short_definition", "language_origin", "approx_period", "parent_ids", "combination_type"]
              }
            }
          },
          "required": ["word_queried", "definition", "example_sentence", "etymology_summary", "lineage"]
        }
      }
    };

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            console.error("Gemini API error from serverless function:", errorBody);
            // Send a structured error to the client
            return response.status(geminiResponse.status).json({ error: `Gemini API request failed. Status: ${geminiResponse.status}` });
        }

        const result = await geminiResponse.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const text = result.candidates[0].content.parts[0].text;
            // The API is expected to return JSON text due to responseSchema
            const jsonData = JSON.parse(text); 
            return response.status(200).json(jsonData);
        } else {
            console.error("Unexpected Gemini API response structure in serverless function:", result);
            return response.status(500).json({ error: 'Failed to parse data from Gemini API response on server.' });
        }

    } catch (error) {
        console.error("Error in serverless function execution:", error);
        return response.status(500).json({ error: `Server error: ${error.message}` });
    }
}
