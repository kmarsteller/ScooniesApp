const express = require('express');
const path = require('path');
const fs = require('fs');
const { initializeDatabase } = require('./db/database');

// Import routes
const entriesRoutes = require('./routes/entries');
const standingsRoutes = require('./routes/standings');
const adminRoutes = require('./routes/admin');
const emailRoutes = require('./routes/email');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initializeDatabase();

// Middleware
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
app.use('/api/admin', adminRoutes);  // Admin routes first (most specific)
app.use('/api/entries', entriesRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/admin', emailRoutes);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve teams.csv directly
app.get('/teams.csv', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/teams.csv'));
});

// HTML Page Routes
// Admin pages
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

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

// Debug admin users if needed
const { db } = require('./db/database');
db.get("SELECT * FROM admin_users", (err, row) => {
    if (err) {
        console.error("Error checking admin users:", err);
    } else if (!row) {
        console.log("No admin users found, creating default admin");
        db.run("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", 
            ["Keith", "5150"], (err) => {
                if (err) {
                    console.error("Error creating admin user:", err);
                } else {
                    console.log("Admin user 'Keith' created successfully");
                }
            });
    } else {
        console.log("Admin user found:", row.username);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server accessible at http://localhost:${PORT}`);
});

module.exports = app;