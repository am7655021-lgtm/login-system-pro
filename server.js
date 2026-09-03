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

const ContactSchema = new mongoose.Schema({
    email: String,
    message: String,
    status: String,
    date: { type: Date, default: Date.now }
}, { collection: 'contacts' });

const UserSchema = new mongoose.Schema({
    email: String
});

let Message;
let User;

try {
    Message = mongoose.models.Message || mongoose.model('Message', ContactSchema);
} catch (error) {
    console.error('Could not initialize Message model:', error.message);
}

try {
    User = mongoose.models.User || mongoose.model('User', UserSchema);
} catch (error) {
    console.error('Could not initialize User model:', error.message);
}

const Contact = Message;

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

const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
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
} else {
    console.log("No MONGODB_URI set, skipping MongoDB connection.");
}

const isDbConnected = () => mongoose.connection.readyState === 1;

// تخزين مؤقت للرسائل عندما لا يكون MongoDB متاحاً
// ملاحظة: هذه الرسائل تُمسح عند إعادة نشر التطبيق
let fallbackMessages = [];

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

        fallbackMessages.push(contactData);
        console.warn('MongoDB unavailable: saved contact message to fallback memory.');
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

        return res.json(fallbackMessages);
    } catch (err) {
        console.error('Failed to retrieve messages:', err.message);
        return res.status(500).json({ error: 'Could not retrieve messages' });
    }
});

app.get('/api/admin-stats', async (req, res) => {
    try {
        const totalMessages = isDbConnected() && typeof Message !== 'undefined'
            ? await Message.countDocuments()
            : fallbackMessages.length;
        const totalUsers = isDbConnected() && typeof User !== 'undefined'
            ? await User.countDocuments()
            : 0;

        return res.json({ totalMessages, totalUsers });
    } catch (error) {
        console.error('Failed to get admin stats:', error);
        return res.status(500).json({ error: error.message || 'Could not retrieve admin stats' });
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