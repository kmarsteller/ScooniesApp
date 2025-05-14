// test-server.js
// A minimal test server just for testing database updates
// Run with: node test-server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

// Create the app
const app = express();
const PORT = 3100; // Use a different port to avoid conflicts

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Database connection
const dbPath = path.join(__dirname, '..', 'db', 'game.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Simple HTML form for testing
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Entry Update Test</title>
            <style>
                body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; }
                input[type="text"], input[type="email"] { width: 100%; padding: 8px; }
                button { padding: 10px 15px; background: #4CAF50; color: white; border: none; cursor: pointer; }
                .result { margin-top: 20px; padding: 15px; background: #f0f0f0; border-radius: 4px; white-space: pre-wrap; }
            </style>
        </head>
        <body>
            <h1>Entry Update Test</h1>
            
            <div class="form-group">
                <label for="entryId">Entry ID:</label>
                <input type="text" id="entryId" value="2">
            </div>
            
            <div class="form-group">
                <label for="playerName">Player Name:</label>
                <input type="text" id="playerName" value="Test Player">
            </div>
            
            <div class="form-group">
                <label for="nickname">Nickname:</label>
                <input type="text" id="nickname" value="Tester">
            </div>
            
            <div class="form-group">
                <label for="email">Email:</label>
                <input type="email" id="email" value="test@example.com">
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="hasPaid"> Has Paid
                </label>
            </div>
            
            <button id="updateBtn">Update Entry</button>
            <button id="getEntryBtn">Get Entry</button>
            
            <div class="result" id="result"></div>
            
            <script>
                document.getElementById('updateBtn').addEventListener('click', function() {
                    const entryId = document.getElementById('entryId').value;
                    const playerName = document.getElementById('playerName').value;
                    const nickname = document.getElementById('nickname').value;
                    const email = document.getElementById('email').value;
                    const hasPaid = document.getElementById('hasPaid').checked;
                    
                    const data = {
                        player_name: playerName,
                        nickname: nickname,
                        email: email,
                        has_paid: hasPaid
                    };
                    
                    document.getElementById('result').textContent = 'Sending request...';
                    
                    fetch('/api/update/' + entryId, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    })
                    .then(response => response.json())
                    .then(data => {
                        document.getElementById('result').textContent = JSON.stringify(data, null, 2);
                    })
                    .catch(error => {
                        document.getElementById('result').textContent = 'Error: ' + error.message;
                    });
                });
                
                document.getElementById('getEntryBtn').addEventListener('click', function() {
                    const entryId = document.getElementById('entryId').value;
                    
                    document.getElementById('result').textContent = 'Fetching entry...';
                    
                    fetch('/api/entry/' + entryId)
                    .then(response => response.json())
                    .then(data => {
                        document.getElementById('result').textContent = JSON.stringify(data, null, 2);
                        
                        // Update form fields
                        if (data.entry) {
                            document.getElementById('playerName').value = data.entry.player_name || '';
                            document.getElementById('nickname').value = data.entry.nickname || '';
                            document.getElementById('email').value = data.entry.email || '';
                            document.getElementById('hasPaid').checked = data.entry.has_paid === 1;
                        }
                    })
                    .catch(error => {
                        document.getElementById('result').textContent = 'Error: ' + error.message;
                    });
                });
            </script>
        </body>
        </html>
    `);
});

// Get entry endpoint
app.get('/api/entry/:id', (req, res) => {
    const entryId = req.params.id;
    
    console.log('Fetching entry ID:', entryId);
    
    db.get('SELECT * FROM entries WHERE id = ?', [entryId], (err, entry) => {
        if (err) {
            console.error('Error fetching entry:', err);
            return res.status(500).json({ error: 'Database error', message: err.message });
        }
        
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        console.log('Found entry:', entry);
        res.json({ entry });
    });
});

// Update endpoint using individual field updates
app.post('/api/update/:id', (req, res) => {
    const entryId = req.params.id;
    const { player_name, nickname, email, has_paid } = req.body;
    
    console.log('Update request for entry ID:', entryId);
    console.log('Request body:', req.body);
    
    // Validate required fields
    if (!entryId) {
        return res.status(400).json({ error: 'Entry ID is required' });
    }
    
    // Make sure entry exists
    db.get('SELECT * FROM entries WHERE id = ?', [entryId], (err, entry) => {
        if (err) {
            console.error('Error checking entry:', err);
            return res.status(500).json({ error: 'Database error', message: err.message });
        }
        
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        console.log('Found entry:', entry);
        
        // Use a simple approach: one field at a time
        const updates = [];
        let totalChanges = 0;
        
        function updateField(field, value, callback) {
            console.log(`Updating ${field} to ${value}`);
            
            // Convert has_paid to integer
            if (field === 'has_paid') {
                value = value ? 1 : 0;
            }
            
            const sql = `UPDATE entries SET ${field} = ? WHERE id = ?`;
            console.log('SQL:', sql);
            console.log('Params:', [value, entryId]);
            
            db.run(sql, [value, entryId], function(err) {
                if (err) {
                    console.error(`Error updating ${field}:`, err);
                    return callback(err);
                }
                
                console.log(`Updated ${field}. Changes: ${this.changes}`);
                updates.push({ field, changes: this.changes });
                totalChanges += this.changes;
                callback(null);
            });
        }
        
        // Update fields one by one
        if (player_name !== undefined) {
            updateField('player_name', player_name, (err) => {
                if (err) return res.status(500).json({ error: `Error updating player_name: ${err.message}` });
                
                if (nickname !== undefined) {
                    updateField('nickname', nickname, (err) => {
                        if (err) return res.status(500).json({ error: `Error updating nickname: ${err.message}` });
                        
                        if (email !== undefined) {
                            updateField('email', email, (err) => {
                                if (err) return res.status(500).json({ error: `Error updating email: ${err.message}` });
                                
                                if (has_paid !== undefined) {
                                    updateField('has_paid', has_paid, (err) => {
                                        if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                                        
                                        // All updates complete
                                        finishUpdate();
                                    });
                                } else {
                                    finishUpdate();
                                }
                            });
                        } else if (has_paid !== undefined) {
                            updateField('has_paid', has_paid, (err) => {
                                if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                                finishUpdate();
                            });
                        } else {
                            finishUpdate();
                        }
                    });
                } else if (email !== undefined) {
                    updateField('email', email, (err) => {
                        if (err) return res.status(500).json({ error: `Error updating email: ${err.message}` });
                        
                        if (has_paid !== undefined) {
                            updateField('has_paid', has_paid, (err) => {
                                if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                                finishUpdate();
                            });
                        } else {
                            finishUpdate();
                        }
                    });
                } else if (has_paid !== undefined) {
                    updateField('has_paid', has_paid, (err) => {
                        if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                        finishUpdate();
                    });
                } else {
                    finishUpdate();
                }
            });
        } else if (nickname !== undefined) {
            updateField('nickname', nickname, (err) => {
                if (err) return res.status(500).json({ error: `Error updating nickname: ${err.message}` });
                
                if (email !== undefined) {
                    updateField('email', email, (err) => {
                        if (err) return res.status(500).json({ error: `Error updating email: ${err.message}` });
                        
                        if (has_paid !== undefined) {
                            updateField('has_paid', has_paid, (err) => {
                                if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                                finishUpdate();
                            });
                        } else {
                            finishUpdate();
                        }
                    });
                } else if (has_paid !== undefined) {
                    updateField('has_paid', has_paid, (err) => {
                        if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                        finishUpdate();
                    });
                } else {
                    finishUpdate();
                }
            });
        } else if (email !== undefined) {
            updateField('email', email, (err) => {
                if (err) return res.status(500).json({ error: `Error updating email: ${err.message}` });
                
                if (has_paid !== undefined) {
                    updateField('has_paid', has_paid, (err) => {
                        if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                        finishUpdate();
                    });
                } else {
                    finishUpdate();
                }
            });
        } else if (has_paid !== undefined) {
            updateField('has_paid', has_paid, (err) => {
                if (err) return res.status(500).json({ error: `Error updating has_paid: ${err.message}` });
                finishUpdate();
            });
        } else {
            // No fields to update
            finishUpdate();
        }
        
        function finishUpdate() {
            // All updates complete
            console.log('All updates complete:', updates);
            
            // Get the updated entry
            db.get('SELECT * FROM entries WHERE id = ?', [entryId], (err, updatedEntry) => {
                if (err) {
                    console.error('Error fetching updated entry:', err);
                    return res.status(500).json({ 
                        error: 'Error fetching updated entry',
                        updates,
                        message: err.message
                    });
                }
                
                res.json({
                    message: 'Entry updated successfully',
                    entryId,
                    updates,
                    totalChanges,
                    entry: updatedEntry
                });
            });
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}`);
    console.log('Open this URL in your browser to test entry updates');
});