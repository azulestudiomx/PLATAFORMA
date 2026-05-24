require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Probando clave API que empieza con:', apiKey ? apiKey.substring(0, 10) + '...' : 'SIN CLAVE');
  
  if (!apiKey) {
    console.error('Error: No se encontró la variable GEMINI_API_KEY en el archivo .env');
    process.exit(1);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    console.log('Enviando consulta de prueba a Gemini ("Hola, di que estás activo y listo en español")...');
    const result = await model.generateContent('Hola, di que estás activo y listo en español');
    const text = result.response.text();
    
    console.log('\n--- RESPUESTA DE GEMINI ---');
    console.log(text.trim());
    console.log('---------------------------\n');
    console.log('✅ ¡PRUEBA EXITOSA! La clave está funcionando perfectamente.');
  } catch (error) {
    console.error('\n❌ ERROR EN LA PRUEBA DE GEMINI:');
    console.error(error.message);
    if (error.message.includes('403') || error.message.includes('blocked')) {
      console.error('\n👉 Tu clave sigue bloqueada por restricciones de API en Google Cloud.');
      console.error('Asegúrate de quitar las restricciones en la consola de Google Cloud (Opción 1 o cambiar a Generative Language API).');
    }
  }
}

main();
