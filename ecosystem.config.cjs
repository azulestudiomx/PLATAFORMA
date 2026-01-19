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
            PORT: 3000
        },
        env_production: {
            NODE_ENV: "production",
            PORT: 3000,
            MONGO_URI: "mongodb://127.0.0.1:27017/plataforma_campeche"
        }
    }]
};
