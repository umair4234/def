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
    // Reset index if it's out of bounds (e.g., keys were removed)
    if (keyIndex >= apiKeys.length) {
        keyIndex = 0;
    }

    // Try each key once, starting from the last known good index
    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[keyIndex];
        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const response = await ai.models.generateContent(params);
            // Success! Save the working key's index for the next call and return.
            setCurrentKeyIndex(keyIndex);
            return response;
        } catch (error) {
            console.warn(`API key at index ${keyIndex} failed. Trying next key.`, error);
            // Rotate to the next key for the next attempt in this loop
            keyIndex = (keyIndex + 1) % apiKeys.length;
        }
    }

    // If the loop completes, it means all keys failed.
    throw new Error("All available API keys failed or have reached their rate limits. Please check your keys in the API Manager or add new ones.");
};
