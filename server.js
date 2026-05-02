require('dotenv').config();
const express = require('express');
const path = require('path');
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

// إنشاء نموذج للبيانات (مثلاً رسائل التواصل)
const ContactSchema = new mongoose.Schema({
    email: String,
    message: String,
    status: String,
    date: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', ContactSchema);
const fallbackMessages = [];

// نقطة نهاية (API Endpoint) لاستقبال البيانات من الواجهة الأمامية
const Sentiment = require('sentiment');
const sentiment = new Sentiment();

app.post('/api/contact', async (req, res) => {
    try {
        const { email, message } = req.body;
        const analysis = sentiment.analyze(message || '');
        const contactData = {
            email: email || 'unknown',
            message: message || '',
            status: analysis.score >= 0 ? 'Positive' : 'Negative',
            date: new Date()
        };

        if (isDbConnected()) {
            const newContact = new Contact(contactData);
            await newContact.save();
            return res.status(200).json({ message: "Sent successfully" });
        }

        fallbackMessages.push(contactData);
        console.warn('MongoDB unavailable: saving contact message to fallback memory.');
        return res.status(200).json({ message: "Sent successfully (stored locally)" });
    } catch (error) {
        console.error('Contact save error:', error);
        return res.status(200).json({ message: "Sent successfully (stored locally)" });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        if (isDbConnected()) {
            const messages = await Contact.find();
            return res.send(messages);
        }

        return res.send(fallbackMessages);
    } catch (err) {
        console.error('Failed to retrieve messages:', err.message);
        return res.send(fallbackMessages);
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

module.exports = app;