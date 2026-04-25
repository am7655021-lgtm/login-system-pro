require('dotenv').config();
const express = require('express');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');
const cors = require('cors');

// استخدم خوادم DNS عامة قوية لحل مشكلات SRV في Node.js
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname)));
const MONGO_URI = process.env.MONGO_URI;
// الاتصال بقاعدة البيانات (استبدل الرابط برابط قاعدة بياناتك أو عيّن المتغير البيئي MONGO_URI)
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    bufferCommands: false
})
    .then(() => console.log("Connected to MongoDB..."))
    .catch(err => console.error("Could not connect to MongoDB...", err.message));

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
        
        // تحليل المشاعر باستخدام المكتبة اللي سطبناها
        const analysis = sentiment.analyze(message);
        
        // إنشاء سجل جديد في قاعدة البيانات
        const newContact = new Contact({
            email: email,
            message: message,
            status: analysis.score >= 0 ? 'Positive' : 'Negative'
        });

        // حفظ الرسالة فعلياً
        await newContact.save(); 

        // الرد على المتصفح بالنجاح عشان الرسالة تختفي عند صاحبك
        res.status(200).json({ message: "تم إرسال رسالتك بنجاح!" });
        
    } catch (error) {
        console.error("خطأ في السيرفر:", error);
        res.status(500).json({ error: "فشل في حفظ الرسالة" });
    }
});

    try {
        if (!isDbConnected()) {
            return res.status(503).send({ status: 'Error', message: 'MongoDB غير متصل. يرجى تشغيل قاعدة البيانات أولاً.' });
        }

        await Contact.create(messageData);
        res.send({ status: 'Success', message: 'Message saved!' });
    } catch (err) {
        console.error('Failed to save contact message:', err.message);
        res.status(500).send({ status: 'Error', message: 'Could not save message' });
    }
});

const PORT = 5005;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// نقطة نهاية (GET Endpoint) لجلب الرسائل المخزنة
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