#!/bin/bash
# deploy-backend.sh
# Uso en el usuario: azulestudiomx-app2

echo "------------------------------------------"
echo "🚀 INICIANDO DESPLIEGUE DEL BACKEND..."
echo "------------------------------------------"

# 1. Bajar cambios de Git
echo "📦 Bajando cambios de Git..."
git pull origin main

# 2. Instalar dependencias del servidor
echo "⚙️ Instalando dependencias del servidor..."
cd server
npm install

# 3. Sincronizar base de datos Prisma (SQLite)
echo "📂 Sincronizando base de datos Prisma..."
npx prisma db push --schema=./prisma/schema.prisma

# 4. Generar Cliente Prisma
npx prisma generate --schema=./prisma/schema.prisma

# 5. Volver a REPO y Reiniciar PM2
cd ..
echo "♻️ Reiniciando proceso PM2..."
pm2 restart ecosystem.config.cjs --env production

echo "------------------------------------------"
echo "✅ ¡BACKEND ACTUALIZADO CON ÉXITO!"
echo "📍 Puerto Real: 3003"
echo "------------------------------------------"
