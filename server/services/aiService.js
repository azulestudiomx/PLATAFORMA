const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

const analyzeReport = async (description, needType) => {
  if (!genAI) return null;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Analiza el siguiente reporte ciudadano y devuelve un JSON con dos campos: "sentiment" (Positivo, Neutral, Negativo) y "urgency" (Alta, Media, Baja).\n\nReporte: "${description}"\nTipo: "${needType}"\n\nJSON:`;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Error en análisis IA:', error);
  }
  return null;
};

module.exports = { analyzeReport };
