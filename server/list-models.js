require('dotenv').config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: No GEMINI_API_KEY');
    process.exit(1);
  }

  try {
    console.log('Consultando lista de modelos vía API REST nativa...');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error('Error de la API de Google:', data.error);
    } else if (data.models) {
      console.log('\n--- MODELOS DISPONIBLES ---');
      data.models.forEach(m => {
        console.log(`- ${m.name} (${m.displayName})`);
      });
      console.log('---------------------------\n');
    } else {
      console.log('Respuesta inesperada:', data);
    }
  } catch (error) {
    console.error('Error al consultar modelos:', error.message);
  }
}

main();
