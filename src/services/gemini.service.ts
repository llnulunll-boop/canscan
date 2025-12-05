
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

export interface TroubleshootingResponse {
  steps: {
    title: string;
    details: string[];
  }[];
}

export interface ExtractedDocumentData {
  id: string;
  subscriberName: string;
  subscriptionNumber: string;
  nationalId: string;
  requestDate: string;
  projectNumber: string;
  officerNumber: string;
  postalCode: string;
  propertyCode: string;
  paymentDate: string;
  scanDate: string;
  [key: string]: string; // Allow for dynamic keys
}


@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private genAI: GoogleGenAI;

  constructor() {
    if (!process.env.API_KEY) {
      console.error("API_KEY environment variable not set. Gemini API will not work.");
      this.genAI = {} as any; // Will be handled in the method call
    } else {
      this.genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }

  async getTroubleshootingSteps(deviceName: string, issue: string): Promise<TroubleshootingResponse> {
    if (!process.env.API_KEY) {
       return {
            steps: [{
                title: "API Key Not Configured",
                details: ["Please set the API_KEY environment variable to use the AI Troubleshooter."]
            }]
        };
    }
    
    try {
      const prompt = `You are a helpful IT support assistant. 
      A non-technical user is having an issue with their device.
      Device: ${deviceName}
      Issue: ${issue}
      Provide a simple list of step-by-step troubleshooting instructions. Each step should have a title and an array of detailed sub-steps.`;

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "The main title of the troubleshooting step." },
                    details: {
                      type: Type.ARRAY,
                      description: "A list of actions or checks for the user to perform.",
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["title", "details"]
                }
              }
            },
            required: ["steps"]
          }
        }
      });
      
      return JSON.parse(response.text);

    } catch (error) {
      console.error('Error calling Gemini API or parsing response:', error);
      return {
            steps: [{
                title: "Error Fetching Steps",
                details: ["Could not get troubleshooting steps from the AI assistant. Please check your network connection and try again."]
            }]
        };
    }
  }

  async analyzeImage(base64Image: string, prompt: string): Promise<string> {
    if (!process.env.API_KEY) {
      return "Error: API_KEY environment variable not set. Gemini API will not work.";
    }

    try {
      const match = base64Image.match(/^data:(image\/.+);base64,(.*)$/);
      if (!match) {
        throw new Error('Invalid base64 image string format.');
      }
      const mimeType = match[1];
      const imageBase64 = match[2];

      const imagePart = {
        inlineData: {
          mimeType: mimeType,
          data: imageBase64,
        },
      };

      const textPart = {
        text: prompt,
      };

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
      });

      return response.text;
    } catch (error) {
      console.error('Error calling Gemini API for image analysis:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      return `Error analyzing image: ${errorMessage}`;
    }
  }

  async extractStructuredData(base64Image: string): Promise<ExtractedDocumentData> {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set. Gemini API will not work.");
    }

    const match = base64Image.match(/^data:(image\/.+);base64,(.*)$/);
    if (!match) {
      throw new Error('Invalid base64 image string format.');
    }
    const mimeType = match[1];
    const imageBase64 = match[2];
    
    const imagePart = {
      inlineData: { mimeType, data: imageBase64 },
    };

    const textPart = {
      text: "You are an expert OCR system for tabular data. Extract all key-value pairs from the provided Persian utility company form. Populate the JSON object according to the schema with the corresponding values. If a value for a field is not present, use an empty string.",
    };

    try {
      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
                subscriberName: { type: Type.STRING, description: 'مقدار فیلد "نام مشترک"' },
                subscriptionNumber: { type: Type.STRING, description: 'مقدار فیلد "شماره اشتراک"' },
                nationalId: { type: Type.STRING, description: 'مقدار فیلد "کد ملی"' },
                requestDate: { type: Type.STRING, description: 'مقدار فیلد "تاریخ درخواست"' },
                projectNumber: { type: Type.STRING, description: 'مقدار فیلد "شماره پروژه"' },
                officerNumber: { type: Type.STRING, description: 'مقدار فیلد "شماره مامور"' },
                postalCode: { type: Type.STRING, description: 'مقدار فیلد "کد پستی"' },
                propertyCode: { type: Type.STRING, description: 'مقدار فیلد "کد ملکیت"' },
                paymentDate: { type: Type.STRING, description: 'مقدار فیلد "تاریخ واریز وجه"' },
            },
            required: ["subscriberName", "subscriptionNumber", "nationalId", "requestDate", "projectNumber", "officerNumber", "postalCode", "propertyCode", "paymentDate"]
          }
        }
      });
      
      return JSON.parse(response.text) as ExtractedDocumentData;

    } catch (error) {
      console.error('Error calling Gemini API for structured data extraction:', error);
      throw new Error("Failed to extract data from the document. The AI model could not process the request.");
    }
  }

}
