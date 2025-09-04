import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from "@google/genai";

const SESSION_KEY_INDEX = 'current_gemini_api_key_index';

const getCurrentKeyIndex = (): number => {
    const indexStr = sessionStorage.getItem(SESSION_KEY_INDEX);
    return indexStr ? parseInt(indexStr, 10) : 0;
};

const setCurrentKeyIndex = (index: number) => {
    sessionStorage.setItem(SESSION_KEY_INDEX, index.toString());
};

export const callGeminiApi = async (
    params: Omit<GenerateContentParameters, 'model'> & { model: string }
): Promise<GenerateContentResponse> => {
    const apiKeys: string[] = JSON.parse(localStorage.getItem('gemini_api_keys') || '[]');
    
    if (apiKeys.length === 0) {
        throw new Error("No Gemini API keys found. Please add a key in the API Manager.");
    }

    let keyIndex = getCurrentKeyIndex();
    if (keyIndex >= apiKeys.length) {
        keyIndex = 0;
    }

    let lastError: Error | null = null;

    // Try each key once, starting from the last known good index
    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[keyIndex];
        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const response = await ai.models.generateContent(params);
            
            // CRITICAL FIX: Access the .text property here to trigger any potential
            // errors (like safety blocks) within this try/catch block.
            const textContent = response.text;

            // If we get here without an error, the call was successful.
            setCurrentKeyIndex(keyIndex);
            return response;

        } catch (error) {
            console.warn(`API key at index ${keyIndex} failed. Trying next key.`, error);
            lastError = error as Error;
            // Rotate to the next key for the next attempt in this loop
            keyIndex = (keyIndex + 1) % apiKeys.length;
        }
    }

    // If the loop completes, all keys failed. Throw the last captured error,
    // as it's the most likely root cause (e.g., safety block, invalid prompt).
    if (lastError) {
        throw new Error(`All API keys failed. Last error: ${lastError.message}`);
    }

    // Fallback error, should be rare
    throw new Error("All available API keys failed. Please check your keys in the API Manager or add new ones.");
};
