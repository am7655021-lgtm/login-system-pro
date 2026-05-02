require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const dns = require('dns');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Routes for HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/test', (req, res) => {
    res.send('Hello World! Server is working.');
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve static files explicitly
app.get('/style.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/script.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'script.js'));
});

// استخدم خوادم DNS عامة قوية لحل مشكلات SRV في Node.js
dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mydb';
const fallbackFile = path.join(os.tmpdir(), 'messages-fallback.json');

if (!process.env.MONGODB_URI && process.env.NODE_ENV === 'production') {
    console.warn("MONGODB_URI is not set in production. Vercel cannot connect to a local MongoDB instance.");
}
if (mongoose.connections[0].readyState) {
    console.log("Using existing MongoDB connection...");
} else {
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        bufferCommands: false,
    })
    .then(() => console.log("Connected to MongoDB..."))
    .catch(err => console.error("Could not connect to MongoDB...", err.message));
}

const isDbConnected = () => mongoose.connection.readyState === 1;

async function readFallbackMessages() {
    try {
        const data = await fs.readFile(fallbackFile, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function saveFallbackMessage(message) {
    const messages = await readFallbackMessages();
    messages.push(message);
    await fs.writeFile(fallbackFile, JSON.stringify(messages, null, 2), 'utf8');
    return messages;
}

// إنشاء نموذج للبيانات (مثلاً رسائل التواصل)
const ContactSchema = new mongoose.Schema({
    email: String,
    message: String,
    status: String,
    date: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', ContactSchema);

// نقطة نهاية (API Endpoint) لاستقبال البيانات من الواجهة الأمامية
const Sentiment = require('sentiment');
const sentiment = new Sentiment();

app.post('/api/contact', async (req, res) => {
    try {
        const { email, message } = req.body;
        if (!email || !message) {
            return res.status(400).json({ error: 'Email and message are required.' });
        }

        const analysis = sentiment.analyze(message);
        const contactData = {
            email,
            message,
            status: analysis.score >= 0 ? 'Positive' : 'Negative',
            date: new Date()
        };

        if (isDbConnected()) {
            const newContact = new Contact(contactData);
            await newContact.save();
            return res.status(200).json({ message: 'Sent successfully' });
        }

        await saveFallbackMessage(contactData);
        console.warn('MongoDB unavailable: saved contact message to fallback file.');
        return res.status(200).json({ message: 'Sent successfully (saved locally)' });
    } catch (error) {
        console.error('Contact save error:', error);
        return res.status(500).json({ error: error.message || 'Server error' });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        if (isDbConnected()) {
            const messages = await Contact.find().sort({ date: -1 });
            return res.json(messages);
        }

        const messages = await readFallbackMessages();
        return res.json(messages);
    } catch (err) {
        console.error('Failed to retrieve messages:', err.message);
        return res.status(500).json({ error: 'Could not retrieve messages' });
    }
});

// بيانات الدخول (يفضل مستقبلاً وضعها في قاعدة البيانات)
const ADMIN_USER = "admin";
const ADMIN_PASS = "12345"; // غيرها لشيء أصعب!

app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;