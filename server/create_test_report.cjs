const mongoose = require('mongoose');
require('dotenv').config();

const ReportSchema = new mongoose.Schema({
    municipio: String,
    comunidad: String,
    location: {
        lat: Number,
        lng: Number
    },
    needType: String,
    evidenceBase64: String, // Base64 image
    status: { type: String, default: 'Pendiente' },
    timestamp: { type: Date, default: Date.now },
    synced: { type: Boolean, default: true },
    user: String,
    customData: Map
});

const ReportModel = mongoose.model('Report', ReportSchema);

async function createReport() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/plataforma_campeche');
        console.log('Connected to MongoDB');

        // Create a simple 1x1 pixel red image base64
        const base64Image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

        const newReport = new ReportModel({
            municipio: 'Campeche',
            comunidad: 'Centro',
            location: { lat: 19.8301, lng: -90.5349 },
            needType: 'Bacheo',
            evidenceBase64: base64Image,
            status: 'Pendiente',
            user: 'admin'
        });

        await newReport.save();
        console.log('Test report created successfully');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

createReport();
