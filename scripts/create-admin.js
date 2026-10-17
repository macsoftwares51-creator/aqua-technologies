require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const schema = new mongoose.Schema({ username: { type: String, unique: true }, passwordHash: String, role: { type: String, default: 'admin' } });
const Admin = mongoose.model('Admin', schema);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = question => new Promise(resolve => rl.question(question, resolve));

(async () => {
    const username = (process.env.ADMIN_USERNAME || await ask('Admin username: ')).trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || await ask('Admin password (12+ characters): ');
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error('Username must be 3-32 characters using letters, numbers, dots, underscores or hyphens.');
    if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) throw new Error('Password must be 12-128 characters and include uppercase, lowercase, number and symbol.');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aquasolar');
    await Admin.findOneAndUpdate({ username }, { username, passwordHash: await bcrypt.hash(password, 12), role: 'admin' }, { upsert: true, new: true });
    console.log(`Admin ${username} created/updated.`);
    await mongoose.disconnect();
    rl.close();
})().catch(error => { console.error(error.message); rl.close(); process.exitCode = 1; });
