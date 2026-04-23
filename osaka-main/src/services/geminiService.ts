import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getPlaceReviewSummary(placeName: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Give a short, catchy 1-sentence review summary for "${placeName}" in Osaka Shinsaibashi in Traditional Chinese.`,
    });
    return response.text?.trim() || "這是一個非常值得一去的地方！";
  } catch (error) {
    console.error("AI Error:", error);
    return "心齋橋必訪景點，深受遊客喜愛。";
  }
}
