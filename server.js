require('dotenv').config();
const express = require('express');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const ContactSchema = new mongoose.Schema({
    email: String,
    message: String,
    status: String,
    date: { type: Date, default: Date.now }
}, { collection: 'contacts' });

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true }
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
const fallbackUsers = new Map();
const SESSION_SECRET = process.env.SESSION_SECRET || 'northstar-development-secret';

const hashPassword = password => crypto.createHash('sha256').update(password).digest('hex');
const createSession = email => {
    const payload = Buffer.from(JSON.stringify({ email })).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    return `${payload}.${signature}`;
};
const getSessionEmail = req => {
    const token = req.headers.cookie?.match(/(?:^|; )store_session=([^;]+)/)?.[1];
    if (!token) return undefined;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return undefined;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString()).email;
    } catch {
        return undefined;
    }
};

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

app.get('/shop.html', (req, res) => {
    if (!getSessionEmail(req)) {
        return res.redirect('/');
    }
    return res.sendFile(path.join(__dirname, 'shop.html'));
});

app.use(express.static(__dirname));

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

app.post('/api/register', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        if (!email || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Enter a valid email and a password of at least 6 characters.' });
        }

        if (isDbConnected() && typeof User !== 'undefined') {
            if (await User.exists({ email })) {
                return res.status(409).json({ success: false, error: 'An account with that email already exists.' });
            }
            await User.create({ email, passwordHash: hashPassword(password) });
        } else {
            if (fallbackUsers.has(email)) {
                return res.status(409).json({ success: false, error: 'An account with that email already exists.' });
            }
            fallbackUsers.set(email, hashPassword(password));
        }

        const token = createSession(email);
        res.setHeader('Set-Cookie', `store_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
        return res.status(201).json({ success: true });
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ success: false, error: 'Could not create your account.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const email = String(req.body.email || req.body.user || '').trim().toLowerCase();
        const password = String(req.body.password || req.body.pass || '');
        let valid = email === 'admin' && password === '12345';

        if (!valid && isDbConnected() && typeof User !== 'undefined') {
            const user = await User.findOne({ email });
            valid = Boolean(user && user.passwordHash === hashPassword(password));
        } else if (!valid) {
            valid = fallbackUsers.get(email) === hashPassword(password);
        }

        if (!valid) {
            return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
        }

        const token = createSession(email);
        res.setHeader('Set-Cookie', `store_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
        return res.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ success: false, error: 'Could not sign you in.' });
    }
});

app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'store_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return res.json({ success: true });
});

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

const PORT = process.env.PORT || 5000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;