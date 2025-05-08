// routes/standings.js
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Get current standings
router.get('/', (req, res) => {
    // Get all entries with scores
    db.all(
        `SELECT id, player_name, email, nickname, score
         FROM entries
         ORDER BY score DESC`,
        (err, entries) => {
            if (err) {
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // For each entry, get their team selections with points
            const entryPromises = entries.map(entry => {
                return new Promise((resolve, reject) => {
                    db.all(
                        `SELECT ts.*, tp.is_eliminated
                         FROM team_selections ts
                         LEFT JOIN tournament_progress tp 
                         ON ts.team_name = tp.team_name AND ts.region = tp.region
                         WHERE ts.entry_id = ?`,
                        [entry.id],
                        (err, teams) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            // Add teams to entry
                            entry.teams = teams;
                            resolve(entry);
                        }
                    );
                });
            });
            
            // Wait for all entries to be processed
            Promise.all(entryPromises)
                .then(completedEntries => {
                    res.json({ entries: completedEntries });
                })
                .catch(err => {
                    res.status(500).json({ error: 'Error fetching team data: ' + err.message });
                });
        }
    );
});

module.exports = router;