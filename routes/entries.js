// Update the entries.js route handler
const express = require('express');
const router = express.Router();
const { db, getCurrentEasternTime } = require('../db/database');

// Check if entries are open
router.get('/status', (req, res) => {
    db.get(
        "SELECT value FROM system_settings WHERE key = 'entries_open'",
        (err, row) => {
            if (err) {
                console.error('Error fetching entry status:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Default to true if no setting exists
            const entriesOpen = row ? row.value === 'true' : true;
            
            res.json({ 
                entriesOpen: entriesOpen
            });
        }
    );
});

/// Submit a new entry (routes/entries.js)
router.post('/', (req, res) => {
    // First, check if entries are open
    const currentEasternTime = getCurrentEasternTime();
    db.get(
        "SELECT value FROM system_settings WHERE key = 'entries_open'",
        (err, row) => {
            if (err) {
                console.error('Error checking entry status:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Default to true if no setting exists
            const entriesOpen = row ? row.value === 'true' : true;
            
            if (!entriesOpen) {
                return res.status(403).json({ error: 'Entry submissions are closed' });
            }
            
            // Continue with the original route logic
            const { playerName, email, nickname, selectedTeams } = req.body;
            
            // Basic validation
            if (!playerName || !email || !nickname || !selectedTeams || !selectedTeams.length) {
                return res.status(400).json({ error: 'All fields are required including at least one team selection' });
            }
            
            // Calculate total points spent
            const totalPoints = selectedTeams.reduce((sum, team) => sum + team.cost, 0);
            
            // Enforce 200 points exactly
            if (totalPoints !== 200) {
                return res.status(400).json({ error: `Entry must use exactly 200 points. Currently using ${totalPoints} points.` });
            }
            
            // Begin transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Insert new entry with all required fields
                db.run(
                    'INSERT INTO entries (player_name, email, nickname, score, submission_date, has_paid) VALUES (?, ?, ?, ?, ?, ?)',
                     [playerName, email, nickname, 0, currentEasternTime, 0],
                    function(err) {
                        if (err) {
                            console.error("Database error inserting entry:", err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error saving entry: ' + err.message });
                        }
                        
                        const entryId = this.lastID;
                        
                        // Insert team selections
                        const teamInsertStmt = db.prepare(
                            'INSERT INTO team_selections (entry_id, team_name, seed, region, cost) VALUES (?, ?, ?, ?, ?)'
                        );
                        
                        let hasError = false;
                        let errorMessage = '';
                        
                        // Insert each team selection
                        selectedTeams.forEach(team => {
                            teamInsertStmt.run(
                                [entryId, team.teamName, team.seed, team.region, team.cost],
                                err => {
                                    if (err) {
                                        hasError = true;
                                        errorMessage = err.message;
                                        console.error("Database error inserting team selection:", err);
                                    }
                                }
                            );
                        });
                        
                        teamInsertStmt.finalize();
                        
                        if (hasError) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error saving team selections: ' + errorMessage });
                        }
                        
                        // Commit transaction
                        db.run('COMMIT', err => {
                            if (err) {
                                console.error("Database error committing transaction:", err);
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Transaction error: ' + err.message });
                            }
                            
                            res.status(201).json({ 
                                message: 'Entry submitted successfully',
                                entryId
                            });
                        });
                    }
                );
            });
        }
    );
});

module.exports = router;