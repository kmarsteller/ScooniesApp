// Run this with: node route-tester.js
// This is a standalone script to test if basic Express routing works

const express = require('express');
const app = express();
const PORT = 3001; // Using a different port to avoid conflicts

// Simple test routes
app.get('/', (req, res) => {
    res.send('Test server is running');
});

app.get('/test', (req, res) => {
    res.json({ message: 'Test route is working' });
});

app.get('/test/:id', (req, res) => {
    res.json({ 
        message: 'Test route with parameter is working',
        id: req.params.id
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}`);
    console.log(`Try these URLs in your browser:`);
    console.log(`- http://localhost:${PORT}/`);
    console.log(`- http://localhost:${PORT}/test`);
    console.log(`- http://localhost:${PORT}/test/123`);
});