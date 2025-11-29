import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';

config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

async function testNewModels() {
    const models = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];

    console.log('🔍 Testing new Gemini models...\n');

    for (const modelName of models) {
        try {
            console.log(`Testing: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent('Say "test successful" in 3 words');
            const response = await result.response;
            const text = response.text();
            console.log(`  ✅ SUCCESS! Response: ${text.trim()}\n`);
        } catch (error: any) {
            console.log(`  ❌ Failed: ${error.message}\n`);
        }
    }
}

testNewModels();
