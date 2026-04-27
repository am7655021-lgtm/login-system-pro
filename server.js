require('dotenv').config();
const express = require('express');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');
const cors = require('cors');

// استخدم خوادم DNS عامة قوية لحل مشكلات SRV في Node.js
dns.setServers(['8.8.8.8', '8.8.4.4']);

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

// نقطة نهاية (API Endpoint) لاستقبال البيانات من الواجهة الأمامية
const Sentiment = require('sentiment');
const sentiment = new Sentiment();

app.post('/api/contact', async (req, res) => {
    try {
        const { email, message } = req.body;
        const analysis = sentiment.analyze(message);
        const newContact = new Contact({
            email,
            message,
            status: analysis.score >= 0 ? 'Positive' : 'Negative'
        });
        await newContact.save();
        res.status(200).json({ message: "Sent successfully" });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Contact.find().sort({ date: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: "Error fetching messages" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.get('/api/messages', async (req, res) => {
    try {
        if (!isDbConnected()) {
            return res.status(503).send("MongoDB غير متصل. يرجى تشغيل قاعدة البيانات أولاً.");
        }

        const messages = await Contact.find().sort({ date: -1 });
        res.json(messages);
    } catch (err) {
        res.status(500).send("Error fetching messages");
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