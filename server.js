//The server, run with "node server.js" or "npm run dev"
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, db } = require('./db/database');
const { initializePlayersDatabase } = require('./db/players-db');
const SqliteStore = require('./db/session-store');

// Import routes
const entriesRoutes = require('./routes/entries');
const standingsRoutes = require('./routes/standings');
const adminRoutes = require('./routes/admin');
const communicationsRoutes = require('./routes/communications');
const bracketRoutes = require('./routes/bracket');

const app = express();
const PORT = process.env.PORT || 3000;

// Set server timezone to Eastern Time
process.env.TZ = 'America/New_York';
// Add this to confirm the timezone is working correctly
const now = new Date();
console.log(`Server timezone: ${process.env.TZ}`);
console.log(`Current server time: ${now.toString()}`);
console.log(`ISO time: ${now.toISOString()}`);
console.log(`Locale time: ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

// Initialize databases
initializeDatabase();
initializePlayersDatabase();

// Middleware
app.use(session({
    store: new SqliteStore(db),
    secret: process.env.SESSION_SECRET || 'scoonies-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Ensure directory structure exists
const cssDir = path.join(__dirname, 'public', 'css');
if (!fs.existsSync(cssDir)) {
    fs.mkdirSync(cssDir, { recursive: true });
    console.log('Created CSS directory:', cssDir);
}

const logoDir = path.join(__dirname, 'public', 'images', 'logos');
if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true });
    console.log('Created logos directory:', logoDir);
}

// API Routes - order matters!
// The order should be from most specific to most general
app.use('/api/admin', adminRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/bracket', bracketRoutes);

// Admin login/redirect — MUST be before static middleware so the session
// check runs instead of express.static serving public/admin/index.html directly
app.get(['/admin', '/admin/'], (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.redirect('/admin/tournament');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Serve teams data — use pre-tourney placeholder when entries are not yet open
app.get('/api/teams', (req, res) => {
    db.all(
        "SELECT key, value FROM system_settings WHERE key IN ('entries_open', 'entries_close_reason')",
        (err, rows) => {
            const settings = {};
            (rows || []).forEach(r => { settings[r.key] = r.value; });
            const entriesOpen = settings['entries_open'] !== undefined ? settings['entries_open'] === 'true' : true;
            const closeReason = settings['entries_close_reason'];
            const usePreTourney = !entriesOpen && closeReason === 'not_yet_open';
            const csvFile = usePreTourney ? 'pre-tourney-teams.csv' : 'teams.csv';
            res.sendFile(path.join(__dirname, 'public', csvFile));
        }
    );
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin/tournament', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'tournament.html'));
});

app.get('/admin/entries', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'entries.html'));
});

app.get('/admin/communications', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'communications.html'));
});

// Main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/submit.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

app.get('/standings.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'standings.html'));
});

app.get('/bracket.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bracket.html'));
});

// Handle 404 - must be after all other routes
app.use((req, res) => {
    // Check if 404.html exists, otherwise send a simple message
    const notFoundPath = path.join(__dirname, 'public', '404.html');
    if (fs.existsSync(notFoundPath)) {
        res.status(404).sendFile(notFoundPath);
    } else {
        res.status(404).send('<h1>404 - Page Not Found</h1><p>The page you are looking for does not exist.</p>');
    }
});

// Error handler - must be the last middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    // Check if 500.html exists, otherwise send a simple message
    const errorPath = path.join(__dirname, 'public', '500.html');
    if (fs.existsSync(errorPath)) {
        res.status(500).sendFile(errorPath);
    } else {
        res.status(500).send('<h1>500 - Server Error</h1><p>Something went wrong on our end. Please try again later.</p>');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server accessible at http://localhost:${PORT}`);
});

module.exports = app;