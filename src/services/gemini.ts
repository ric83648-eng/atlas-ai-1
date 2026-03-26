import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { Tier } from "../types";

const getAI = () => {
  // Use API_KEY if available (from selection dialog), otherwise fallback to GEMINI_API_KEY
  const key = (process.env as any).API_KEY || process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey: key });
};

export const generateImage = async (prompt: string, tier: Tier): Promise<string> => {
  try {
    const ai = getAI();
    const model = tier === 'low' ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview';
    
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: tier === 'premium' ? "2K" : "1K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error: any) {
    if (error?.message?.includes('403') || error?.message?.includes('permission') || error?.message?.includes('Requested entity was not found')) {
      throw new Error("Erro de Permissão (403). Modelos avançados (Veo/Imagen) requerem uma chave de API de um projeto com faturamento ativado. Clique no botão abaixo para selecionar uma nova chave ou verifique seu faturamento em ai.google.dev/gemini-api/docs/billing");
    }
    throw error;
  }
};

export const chatWithAI = async (message: string, history: any[]) => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: "You are a creative assistant. You help users generate images. If the user asks to create an image, acknowledge it and wait for the generation process to start. Be concise and inspiring.",
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};
