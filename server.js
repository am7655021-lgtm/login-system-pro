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

const ProductSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
    customerEmail: { type: String, required: true },
    phone: { type: String, required: true },
    governorate: { type: String, required: true },
    city: { type: String, required: true },
    address: { type: String, required: true },
    items: [{ productId: mongoose.Schema.Types.ObjectId, title: String, price: Number, quantity: Number }],
    totalPrice: { type: Number, required: true },
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

let Message;
let User;
let Product;
let Order;

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

try {
    Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
} catch (error) {
    console.error('Could not initialize Product model:', error.message);
}

try {
    Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);
} catch (error) {
    console.error('Could not initialize Order model:', error.message);
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
const requireAdmin = (req, res, next) => {
    if (getSessionEmail(req) !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    return next();
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
    if (getSessionEmail(req) !== 'admin') return res.redirect('/login.html');
    return res.sendFile(path.join(__dirname, 'admin.html'));
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

app.get('/api/products', async (req, res) => {
    try {
        if (typeof Product === 'undefined' || !isDbConnected()) return res.json([]);
        const products = await Product.find().sort({ createdAt: -1 }).lean();
        return res.json(products);
    } catch (error) {
        console.error('Failed to retrieve products:', error);
        return res.status(500).json({ error: 'Could not retrieve products.' });
    }
});

app.post('/api/products', requireAdmin, async (req, res) => {
    try {
        if (typeof Product === 'undefined' || !isDbConnected()) {
            return res.status(503).json({ error: 'MongoDB is required to manage products.' });
        }
        const { title, price, description, imageUrl } = req.body;
        const numericPrice = Number(price);
        if (!title?.trim() || !Number.isFinite(numericPrice) || numericPrice < 0) {
            return res.status(400).json({ error: 'A product title and valid non-negative price are required.' });
        }
        const product = await Product.create({ title: title.trim(), price: numericPrice, description, imageUrl });
        return res.status(201).json(product);
    } catch (error) {
        console.error('Failed to create product:', error);
        return res.status(500).json({ error: 'Could not create product.' });
    }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    try {
        if (typeof Product === 'undefined' || !isDbConnected()) {
            return res.status(503).json({ error: 'MongoDB is required to manage products.' });
        }
        const deleted = await Product.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Product not found.' });
        return res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete product:', error);
        return res.status(400).json({ error: 'Could not delete product.' });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const customerEmail = getSessionEmail(req);
        if (!customerEmail) return res.status(401).json({ error: 'Please sign in before checking out.' });
        if (typeof Order === 'undefined' || typeof Product === 'undefined' || !isDbConnected()) {
            return res.status(503).json({ error: 'MongoDB is required to place orders.' });
        }

        const { phone, governorate, city, address, items } = req.body;
        if (!phone?.trim() || !governorate?.trim() || !city?.trim() || !address?.trim() || !Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: 'Phone, governorate, city, address, and cart items are required.' });
        }

        const requestedIds = items.map(item => item.productId).filter(id => mongoose.isValidObjectId(id));
        const products = await Product.find({ _id: { $in: requestedIds } }).lean();
        const orderItems = items.map(item => {
            const product = products.find(value => value._id.toString() === item.productId);
            const quantity = Number(item.quantity);
            return product && Number.isInteger(quantity) && quantity > 0
                ? { productId: product._id, title: product.title, price: product.price, quantity }
                : null;
        }).filter(Boolean);
        if (!orderItems.length || orderItems.length !== items.length) return res.status(400).json({ error: 'One or more cart items are no longer available.' });

        const totalPrice = orderItems.reduce((total, item) => total + item.price * item.quantity, 0);
        const order = await Order.create({ customerEmail, phone: phone.trim(), governorate: governorate.trim(), city: city.trim(), address: address.trim(), items: orderItems, totalPrice, status: 'Pending' });
        return res.status(201).json({ success: true, orderId: order._id });
    } catch (error) {
        console.error('Failed to create order:', error);
        return res.status(500).json({ error: 'Could not place your order.' });
    }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
    try {
        if (typeof Order === 'undefined' || !isDbConnected()) return res.json([]);
        return res.json(await Order.find().sort({ createdAt: -1 }).lean());
    } catch (error) {
        console.error('Failed to retrieve orders:', error);
        return res.status(500).json({ error: 'Could not retrieve orders.' });
    }
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