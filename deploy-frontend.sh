#!/bin/bash
# deploy-frontend.sh
# Uso en el usuario: azulestudiomx-plataformacampeche

echo "------------------------------------------"
echo "🚀 INICIANDO DESPLIEGUE DEL FRONTEND..."
echo "------------------------------------------"

# 1. Bajar cambios de Git
echo "📦 Bajando cambios de Git..."
git pull origin main

# 2. Instalar dependencias
echo "⚙️ Instalando dependencias..."
npm install

# 3. Construir para producción
echo "🏗️ Compilando (Build)..."
npm run build

# 4. Copiar a la carpeta de CloudPanel
echo "📂 Copiando archivos a htdocs..."
# Ruta específica de Nginx:
HTDOCS_PATH="/home/azulestudiomx-plataformacampeche/htdocs/plataformacampeche.azulestudiomx.cloud/"
cp -rv dist/* "$HTDOCS_PATH"

echo "------------------------------------------"
echo "✅ ¡FRONTEND ACTUALIZADO CON ÉXITO!"
echo "💡 Recuerda: Ctrl+F5 en tu navegador."
echo "------------------------------------------"
