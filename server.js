const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { v2: cloudinary } = require('cloudinary');
const path = require('path');
require('dotenv').config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '';
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    if (isProduction) throw new Error('A JWT_SECRET of at least 32 characters is required in production.');
    console.warn('Set a random JWT_SECRET of at least 32 characters before production.');
}
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(helmet({
    frameguard: { action: 'deny' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.cloudinary.com'],
            ...(isProduction ? { upgradeInsecureRequests: [] } : {})
        }
    },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use((req, res, next) => {
    if (isProduction && !req.secure) return res.redirect(`https://${req.get('host')}${req.originalUrl}`);
    next();
});
app.use(cors({ origin: FRONTEND_ORIGIN || false, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
    if (!req.cookies.csrf_token) res.cookie('csrf_token', crypto.randomBytes(32).toString('hex'), { httpOnly: false, secure: isProduction, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/' });
    next();
});
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.use('/api/admin', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' } });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const leadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const reviewLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const adminActionLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

function securityLog(event, req, details = {}) {
    console.warn(JSON.stringify({ event, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 200), ...details }));
}

function csrfGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const cookieToken = req.cookies.csrf_token;
    const headerToken = req.get('x-csrf-token');
    if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        securityLog('csrf_rejected', req, { path: req.path });
        return res.status(403).json({ error: 'Request could not be verified.' });
    }
    next();
}
app.use(csrfGuard);

const adminSchema = new mongoose.Schema({ username: { type: String, unique: true, required: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true }, role: { type: String, enum: ['admin'], default: 'admin' }, lastLoginAt: Date }, { timestamps: true });
const contentSchema = new mongoose.Schema({ key: { type: String, unique: true, default: 'main' }, content: { type: mongoose.Schema.Types.Mixed, required: true }, version: { type: Number, default: 1 }, updatedBy: String }, { timestamps: true });
const auditSchema = new mongoose.Schema({ actor: String, action: String, ip: String, changes: mongoose.Schema.Types.Mixed }, { timestamps: true });
const leadSchema = new mongoose.Schema({ fullName: { type: String, required: true, maxlength: 120 }, email: { type: String, required: true, maxlength: 160 }, phone: { type: String, required: true, maxlength: 40 }, service: { type: String, required: true, maxlength: 120 }, propertyType: String, monthlyBill: Number, estimatedSavings: String, message: { type: String, maxlength: 3000 }, createdAt: { type: Date, default: Date.now } });
const reviewSchema = new mongoose.Schema({ name: { type: String, required: true, maxlength: 80 }, rating: { type: Number, required: true, min: 1, max: 5 }, comment: { type: String, required: true, maxlength: 1000 }, approved: { type: Boolean, default: false, index: true }, reviewedBy: String, reviewedAt: Date }, { timestamps: true });
const Admin = mongoose.model('Admin', adminSchema);
const SiteContent = mongoose.model('SiteContent', contentSchema);
const AuditLog = mongoose.model('AuditLog', auditSchema);
const Lead = mongoose.model('Lead', leadSchema);
const Review = mongoose.model('Review', reviewSchema);

const defaultContent = {
    brand: { name: 'Aqua Solar Technologies Ltd', tagline: 'Green Energy for a Clean Future', logoUrl: '/assets/logo.jpeg' },
    hero: { eyebrow: 'AQUA SOLAR TECHNOLOGIES LIMITED', title: 'Water, energy and construction — delivered with confidence.', description: 'From borehole surveys to solar systems and water infrastructure, we deliver practical solutions for communities, institutions and businesses across Kenya.', ctaText: 'Request a free quote' },
    services: [
        { title: 'Solar Solutions', icon: 'fa-solar-panel', description: 'Residential, commercial and industrial PV systems, solar water pumps, street lighting and off-grid battery storage.' },
        { title: 'Borehole Drilling & Water', icon: 'fa-water', description: 'Hydrogeological surveys, drilling, casing, test pumping and submersible pump installation.' },
        { title: 'Steel Tanks & Towers', icon: 'fa-industry', description: 'Fabrication and erection of elevated steel tanks from 5 m³ to 100 m³ and above, plus water towers.' },
        { title: 'Electrical Engineering', icon: 'fa-bolt', description: 'Complete wiring, industrial control panels, automation and backup generator installations.' },
        { title: 'Hydrological Survey', icon: 'fa-compass', description: 'Groundwater studies, aquifer mapping, environmental impact assessments and groundwater monitoring.' },
        { title: 'Building & Roads', icon: 'fa-road', description: 'Civil engineering, road works, water and sewer systems design, drainage and flood-control infrastructure.' },
        { title: 'Swimming Pools', icon: 'fa-person-swimming', description: 'Design, construction and maintenance of residential and commercial swimming pools.' },
        { title: 'Generator Services', icon: 'fa-gears', description: 'Supply, installation and maintenance of standby and industrial generators.' }
    ],
    projects: [
        { description: 'Karachuonyo water supply — engineering design', client: 'Lake Victoria South Water Works Development Agency', value: '2,290,300', year: '2020' },
        { description: 'Kenya Cuttings farm water supply survey — Ruiri', client: 'Syngenta East Africa Ltd', value: '3,530,000', year: '2021' },
        { description: 'Malka Bisadi solar pumping system — Isiolo', client: 'Ministry of Agriculture', value: '2,579,629', year: '2022' },
        { description: 'Elbokoch community borehole rehabilitation — Marsabit', client: 'Concern Worldwide', value: '3,542,768', year: '2022' },
        { description: 'Buwa/Ruko community water system — Tana River', client: 'Concern Worldwide', value: '3,456,988', year: '2022' },
        { description: 'Naoros water point rehabilitation — Turkana', client: 'Concern Worldwide', value: '4,283,372', year: '2023' },
        { description: 'Nakinomet water project rehabilitation — Turkana', client: 'Concern Worldwide', value: '3,957,597', year: '2023' },
        { description: 'Borehole drilling — Samburu County', client: 'Various', value: '2,387,000', year: '2023' },
        { description: '50 m³ steel tank and 9 m tower — Maralal', client: 'Strategies for Northern Development', value: '3,807,804', year: '2024' },
        { description: '50 m³ steel tank and 9 m tower — Moyale', client: 'Strategies for Northern Development', value: '3,566,443', year: '2024' }
    ],
    contact: { email: 'aquasolart@gmail.com', phone: '+254 741 276241 / +254 720 121155', whatsapp: '+254 727 896351', address: 'Makutano Junction, Meru-Maua Road, Meru', poBox: 'P.O. Box 62700 – 00200, Westlands, Nairobi', website: 'www.aquasolarltd.co.ke' },
    footer: { copyright: 'Aqua Solar Technologies Ltd' }
};
function cleanText(value, max = 5000) { return typeof value === 'string' ? value.trim().slice(0, max) : value; }
function safeString(value, max, pattern = /^[^\u0000-\u001f\u007f]+$/u) { return typeof value === 'string' && value.length > 0 && value.length <= max && pattern.test(value.trim()) ? value.trim() : null; }
function validateContent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Content must be an object.';
    if (!Object.keys(value).every(key => ['brand', 'hero', 'services', 'projects', 'contact', 'footer'].includes(key))) return 'Content contains unsupported fields.';
    if (Buffer.byteLength(JSON.stringify(value)) > 150000) return 'Content is too large.';
    if (!Array.isArray(value.services) || value.services.length > 50 || !value.services.every(service => safeString(service.title, 120) && safeString(service.description, 1000) && (!service.icon || /^fa-[a-z0-9-]{1,60}$/u.test(service.icon)))) return 'Services contain invalid data.';
    if (!Array.isArray(value.projects) || value.projects.length > 200 || !value.projects.every(project => safeString(project.description, 240) && safeString(project.client, 160) && safeString(project.value, 40, /^[0-9, .+\-–—]+$/u) && safeString(project.year, 4, /^(19|20)\d{2}$/u))) return 'Projects contain invalid data.';
    const contact = value.contact || {};
    if (!safeString(contact.email, 160, /^[^\s@]+@[^\s@]+\.[^\s@]+$/u) || !safeString(contact.phone, 60, /^[+\d ()/.-]{7,60}$/u) || !safeString(contact.whatsapp, 30, /^[+\d ()-]{7,30}$/u) || !safeString(contact.address, 240) || !safeString(contact.poBox, 160) || !safeString(contact.website, 160, /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/iu)) return 'Contact details contain invalid data.';
    if (value.brand && (value.brand.logoUrl && !/^\/(?:assets|uploads)\/[a-zA-Z0-9._/-]+$/.test(value.brand.logoUrl) && !/^https:\/\//i.test(value.brand.logoUrl))) return 'Logo URL is invalid.';
    return null;
}
function requireAdmin(req, res, next) {
    try {
        if (!JWT_SECRET) return res.status(503).json({ error: 'Admin authentication is not configured.' });
        const admin = jwt.verify(req.cookies.admin_session || '', JWT_SECRET, { algorithms: ['HS256'], issuer: 'aqua-solar', audience: 'aqua-solar-admin' });
        if (admin.role !== 'admin' || !admin.sub || !admin.username) throw new Error('Invalid role');
        req.admin = admin;
        next();
    } catch {
        securityLog('authorization_failed', req, { path: req.path });
        res.status(401).json({ error: 'Authentication required.' });
    }
}
function sameOrigin(req, res, next) { const origin = req.get('origin'); const allowed = FRONTEND_ORIGIN || `${req.protocol}://${req.get('host')}`; if (origin && origin !== allowed) { securityLog('origin_rejected', req, { path: req.path }); return res.status(403).json({ error: 'Request could not be verified.' }); } next(); }

app.get('/api/health', (req, res) => res.json({ success: true, service: 'aqua-solar-website' }));
app.get('/api/site-content', async (req, res) => { try { const stored = await SiteContent.findOne({ key: 'main' }).lean(); res.set('Cache-Control', 'no-store'); res.json({ success: true, content: stored?.content || defaultContent, version: stored?.version || 0 }); } catch { res.status(503).json({ success: false, error: 'Content database is temporarily unavailable.' }); } });
app.get('/api/reviews', async (req, res) => { try { const reviews = await Review.find({ approved: true }).sort({ createdAt: -1 }).limit(30).lean(); res.json({ success: true, reviews }); } catch { res.status(503).json({ success: false, error: 'Reviews are temporarily unavailable.' }); } });
app.post('/api/reviews', reviewLimiter, sameOrigin, async (req, res) => { try { const body = req.body || {}; const name = safeString(body.name, 80, /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,79}$/u); const comment = safeString(body.comment, 1000); const rating = Number(body.rating); if (body.website || !name || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Name, review and a rating from 1 to 5 are required.' }); await Review.create({ name, comment, rating }); res.status(201).json({ success: true, message: 'Thank you. Your review is awaiting approval.' }); } catch { securityLog('review_validation_or_storage_error', req); res.status(500).json({ success: false, error: 'Unable to submit your review right now.' }); } });
app.post('/api/admin/login', authLimiter, sameOrigin, async (req, res) => { try { const body = req.body || {}; const username = safeString(body.username, 32, /^[a-z0-9][a-z0-9._-]{2,31}$/i)?.toLowerCase(); const password = body.password; if (!username || typeof password !== 'string' || password.length < 12 || password.length > 128) { securityLog('login_validation_failed', req); return res.status(400).json({ error: 'Invalid credentials.' }); } const admin = await Admin.findOne({ username }); if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) { securityLog('login_failed', req, { username }); return res.status(401).json({ error: 'Invalid credentials.' }); } await Admin.updateOne({ _id: admin._id }, { lastLoginAt: new Date() }); const token = jwt.sign({ sub: admin._id.toString(), username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256', issuer: 'aqua-solar', audience: 'aqua-solar-admin' }); res.cookie('admin_session', token, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/' }); securityLog('login_success', req, { username }); res.json({ success: true, username: admin.username }); } catch { securityLog('login_service_error', req); res.status(503).json({ error: 'Authentication service is temporarily unavailable.' }); } });
app.post('/api/admin/logout', requireAdmin, sameOrigin, (req, res) => { res.clearCookie('admin_session', { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' }); res.json({ success: true }); });
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ success: true, username: req.admin.username, role: req.admin.role }));
app.get('/api/admin/content', requireAdmin, async (req, res) => { try { const doc = await SiteContent.findOne({ key: 'main' }).lean(); res.json({ success: true, content: doc?.content || defaultContent, version: doc?.version || 0 }); } catch { res.status(503).json({ error: 'Content service is temporarily unavailable.' }); } });
app.put('/api/admin/content', writeLimiter, requireAdmin, sameOrigin, async (req, res) => { try { const error = validateContent(req.body.content); if (error) { securityLog('content_validation_failed', req); return res.status(400).json({ error }); } const sanitized = JSON.parse(JSON.stringify(req.body.content, (key, value) => typeof value === 'string' ? cleanText(value) : value)); const current = await SiteContent.findOne({ key: 'main' }); const requestedVersion = Number(req.body.version); if (current && (!Number.isInteger(requestedVersion) || requestedVersion !== current.version)) return res.status(409).json({ error: 'This content was changed by another session. Reload before saving.', version: current.version }); const nextVersion = (current?.version || 0) + 1; await SiteContent.findOneAndUpdate({ key: 'main' }, { key: 'main', content: sanitized, version: nextVersion, updatedBy: req.admin.username }, { upsert: true, new: true, setDefaultsOnInsert: true }); await AuditLog.create({ actor: req.admin.username, action: 'content.update', ip: req.ip, changes: { version: nextVersion } }); res.json({ success: true, content: sanitized, version: nextVersion }); } catch { securityLog('content_update_error', req); res.status(500).json({ error: 'Content could not be saved.' }); } });
app.get('/api/admin/audit', requireAdmin, async (req, res) => { try { const entries = await AuditLog.find().sort({ createdAt: -1 }).limit(50).select({ action: 1, createdAt: 1, _id: 0 }).lean(); res.json({ success: true, entries }); } catch { res.status(503).json({ error: 'Audit log is temporarily unavailable.' }); } });
app.get('/api/admin/reviews', requireAdmin, async (req, res) => { try { res.json({ success: true, reviews: await Review.find().sort({ createdAt: -1 }).limit(100).lean() }); } catch { res.status(503).json({ error: 'Review queue is temporarily unavailable.' }); } });
app.patch('/api/admin/reviews/:id', adminActionLimiter, requireAdmin, sameOrigin, async (req, res) => { try { if (!mongoose.isValidObjectId(req.params.id) || !['approved', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid review request.' }); const approved = req.body.status === 'approved'; const review = await Review.findByIdAndUpdate(req.params.id, { approved, reviewedBy: req.admin.username, reviewedAt: new Date() }, { new: true }); if (!review) return res.status(404).json({ error: 'Review not found.' }); res.json({ success: true, review }); } catch { res.status(500).json({ error: 'Review could not be updated.' }); } });
app.delete('/api/admin/reviews/:id', adminActionLimiter, requireAdmin, sameOrigin, async (req, res) => { try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid review request.' }); const review = await Review.findByIdAndDelete(req.params.id); if (!review) return res.status(404).json({ error: 'Review not found.' }); res.json({ success: true }); } catch { res.status(500).json({ error: 'Review could not be deleted.' }); } });
app.post('/api/admin/cloudinary-signature', adminActionLimiter, requireAdmin, sameOrigin, (req, res) => { if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ error: 'Upload service is not configured.' }); cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET }); const timestamp = Math.round(Date.now() / 1000); const folder = 'aqua-solar/site'; const uploadParams = { timestamp, folder, resource_type: 'image', allowed_formats: 'jpg,jpeg,png,webp', max_file_size: 5 * 1024 * 1024, unique_filename: true, use_filename: false }; res.json({ ...uploadParams, signature: cloudinary.utils.api_sign_request(uploadParams, process.env.CLOUDINARY_API_SECRET), apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME }); });
app.post('/api/leads', leadLimiter, sameOrigin, async (req, res) => { try { const body = req.body || {}; const fullName = safeString(body.fullName, 120, /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,119}$/u); const email = safeString(body.email, 160, /^[^\s@]+@[^\s@]+\.[^\s@]+$/u); const phone = safeString(body.phone, 40, /^[+\d ()-]{7,40}$/u); const service = safeString(body.service, 120); const propertyType = safeString(body.propertyType, 60, /^[a-z-]+$/u); const monthlyBill = Number(body.monthlyBill); const estimatedSavings = safeString(body.estimatedSavings, 100); const message = body.message ? safeString(body.message, 3000) : '';
    if (body.website || !fullName || !email || !phone || !service || (body.propertyType && !propertyType) || (body.monthlyBill !== undefined && (!Number.isFinite(monthlyBill) || monthlyBill < 0 || monthlyBill > 100000000)) || (body.message && !message)) return res.status(400).json({ success: false, error: 'Please provide valid quote details.' });
    await Lead.create({ fullName, email, phone, service, propertyType, monthlyBill: Number.isFinite(monthlyBill) ? monthlyBill : undefined, estimatedSavings, message }); res.status(201).json({ success: true, message: 'Quote request received successfully! We will contact you within 24 hours.' });
} catch { securityLog('lead_validation_or_storage_error', req); res.status(500).json({ success: false, error: 'Unable to save your request right now.' }); } });

app.use((error, req, res, next) => {
    securityLog('request_error', req, { code: error.code || 'unknown' });
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
});

mongoose.set('bufferTimeoutMS', 5000);
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aquasolar', { serverSelectionTimeoutMS: 5000 }).then(() => console.log('Connected to MongoDB')).catch(err => console.error('MongoDB connection error:', err.message));
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Aqua Solar website running on http://localhost:${PORT}`));
server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the existing server or run with PORT=3001 npm start.`);
        process.exitCode = 1;
    } else {
        console.error('Unable to start the web server:', error.message);
        process.exitCode = 1;
    }
});
