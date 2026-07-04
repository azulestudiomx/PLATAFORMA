module.exports = {
    apps: [{
        name: "plataforma-api",
        script: "./server/index.js",
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: "development",
            PORT: 3003
        },
        env_production: {
            NODE_ENV: "production",
            PORT: 3003
            // JWT_SECRET, GEMINI_API_KEY, CLOUDINARY_* y CORS_ORIGIN
            // se cargan desde server/.env (dotenv), nunca desde este archivo.
        }
    }]
};
