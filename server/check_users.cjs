const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String,
    role: { type: String, enum: ['ADMIN', 'CAPTURIST'], default: 'CAPTURIST' }
});

const UserModel = mongoose.model('User', UserSchema);

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/plataforma_campeche');
        console.log('Connected to MongoDB');

        const users = await UserModel.find({}, 'username role');
        console.log('Existing users:', users);

        // Reset admin password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);

        await UserModel.findOneAndUpdate(
            { username: 'admin' },
            { password: hashedPassword },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log('Admin password reset to: admin123');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkUsers();
