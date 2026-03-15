const bcrypt = require('bcrypt');
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { db } = require('../db/database');
const { calculatePoints } = require('../utils/scoring');

// Auth middleware — applied to all routes except login/logout
function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Get tournament data
router.get('/tournament', requireAuth, (req, res) => {
    db.all('SELECT * FROM tournament_progress ORDER BY region, seed', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        res.json({ tournamentData: rows });
    });
});

// Admin login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log('Login attempt:', username); // For debugging
    
    // First, get the admin user by username
    db.get('SELECT id, password_hash FROM admin_users WHERE username = ?', [username], async (err, row) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!row) {
            console.log('Invalid credentials for user:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        try {
            // Compare the provided password with the stored hash
            const passwordMatch = await bcrypt.compare(password, row.password_hash);
            
            if (!passwordMatch) {
                console.log('Invalid password for user:', username);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            console.log('Login successful for user:', username);

            req.session.isAdmin = true;
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                    return res.status(500).json({ error: 'Session error' });
                }
                res.json({ success: true, message: 'Login successful' });
            });
        } catch (error) {
            console.error('Error comparing passwords:', error);
            return res.status(500).json({ error: 'Authentication error' });
        }
    });
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// Possible fix for admin.js entry update route
// Replace your existing router.put('/entry/:id', ...) function with this one:

router.put('/entry/:id', requireAuth, (req, res) => {
    const entryId = parseInt(req.params.id, 10); // Convert to number explicitly
    const { player_name, nickname, email, has_paid } = req.body;
    
    console.log('Update request received:');
    console.log('Entry ID:', entryId, '(type:', typeof entryId, ')');
    console.log('Request body:', req.body);
    
    // Validate required fields
    if (!entryId || !player_name || !nickname || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Convert has_paid to 0 or 1 for SQLite boolean
    const hasPaidValue = has_paid ? 1 : 0;
    
    // First check if entry exists
    db.get('SELECT * FROM entries WHERE id = ?', [entryId], (err, entry) => {
        if (err) {
            console.error('Error checking entry:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!entry) {
            console.error('Entry not found with ID:', entryId);
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        console.log('Found entry before update:', entry);
        
        // Update fields one at a time for safety
        
        // Update player_name
        db.run('UPDATE entries SET player_name = ? WHERE id = ?', [player_name, entryId], function(err) {
            if (err) {
                console.error('Error updating player_name:', err);
                return res.status(500).json({ error: 'Error updating player name: ' + err.message });
            }
            
            // Update nickname
            db.run('UPDATE entries SET nickname = ? WHERE id = ?', [nickname, entryId], function(err) {
                if (err) {
                    console.error('Error updating nickname:', err);
                    return res.status(500).json({ error: 'Error updating nickname: ' + err.message });
                }
                
                // Update email
                db.run('UPDATE entries SET email = ? WHERE id = ?', [email, entryId], function(err) {
                    if (err) {
                        console.error('Error updating email:', err);
                        return res.status(500).json({ error: 'Error updating email: ' + err.message });
                    }
                    
                    // Update has_paid
                    db.run('UPDATE entries SET has_paid = ? WHERE id = ?', [hasPaidValue, entryId], function(err) {
                        if (err) {
                            console.error('Error updating has_paid:', err);
                            return res.status(500).json({ error: 'Error updating payment status: ' + err.message });
                        }
                        
                        // Success! Get the updated entry to verify
                        db.get('SELECT * FROM entries WHERE id = ?', [entryId], (err, updatedEntry) => {
                            if (err) {
                                console.error('Error fetching updated entry:', err);
                            } else {
                                console.log('Entry after update:', updatedEntry);
                            }
                            
                            // Return success response
                            res.json({ 
                                message: 'Entry updated successfully',
                                entryId
                            });
                        });
                    });
                });
            });
        });
    });
});
// Update payment status for an entry
router.put('/entry/:id/payment', requireAuth, (req, res) => {
    const entryId = req.params.id;
    const { has_paid } = req.body;
    
    if (!entryId) {
        return res.status(400).json({ error: 'Entry ID is required' });
    }
    
    // Convert has_paid to 0 or 1 for SQLite boolean
    const hasPaidValue = has_paid ? 1 : 0;
    
    // Update payment status
    db.run(
        'UPDATE entries SET has_paid = ? WHERE id = ?',
        [hasPaidValue, entryId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error updating payment status: ' + err.message });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Entry not found' });
            }
            
            res.json({ 
                message: 'Payment status updated successfully',
                entryId,
                has_paid: hasPaidValue
            });
        }
    );
});
// Get all entries (for admin panel)
router.get('/entries', requireAuth, (req, res) => {
    console.log('GET /api/admin/entries endpoint called at', new Date().toISOString());
    
    // Use a promise-based approach for more reliable handling
    new Promise((resolve, reject) => {
        db.all(
            `SELECT id, player_name, email, nickname, score, submission_date, has_paid
             FROM entries
             ORDER BY submission_date DESC`,
            (err, entries) => {
                if (err) {
                    console.error('Database error fetching entries:', err);
                    return reject(err);
                }
                
                console.log(`Found ${entries ? entries.length : 0} entries`);
                resolve(entries || []);
            }
        );
    })
    .then(entries => {
        // Get team selections for each entry
        const entryPromises = entries.map(entry => {
            return new Promise((resolve, reject) => {
                db.all(
                    `SELECT ts.*, tp.is_eliminated, tp.round_reached
                     FROM team_selections ts
                     LEFT JOIN tournament_progress tp ON ts.team_name = tp.team_name AND ts.region = tp.region
                     WHERE ts.entry_id = ?`,
                    [entry.id],
                    (err, teams) => {
                        if (err) {
                            console.error(`Error fetching teams for entry ${entry.id}:`, err);
                            return reject(err);
                        }
                        
                        // Add teams to entry
                        entry.teams = teams || [];
                        resolve(entry);
                    }
                );
            });
        });
        
        // Wait for all entries with teams to be processed
        return Promise.all(entryPromises);
    })
    .then(completedEntries => {
        console.log('Sending response with', completedEntries.length, 'entries');
        res.json({ entries: completedEntries });
    })
    .catch(err => {
        console.error('Error in /api/admin/entries:', err);
        res.status(500).json({ error: 'Database error: ' + err.message, entries: [] });
    });
});

// Advance a team to the next round
router.post('/advance-team', requireAuth, (req, res) => {
    const { winnerId, loserId, toRound } = req.body;
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Update winner
        db.run(
            'UPDATE tournament_progress SET round_reached = ? WHERE id = ?',
            [toRound, winnerId],
            err => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error updating winner: ' + err.message });
                }
                
                // Update loser
                db.run(
                    'UPDATE tournament_progress SET is_eliminated = 1 WHERE id = ?',
                    [loserId],
                    err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error updating loser: ' + err.message });
                        }
                        
                        // Update Final Four status if advancing to round 5
                        if (toRound === 5) {
                            db.run(
                                'UPDATE tournament_progress SET is_final_four = 1 WHERE id = ?',
                                [winnerId],
                                err => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ 
                                            error: 'Error updating Final Four status: ' + err.message 
                                        });
                                    }
                                    
                                    // Commit transaction
                                    db.run('COMMIT', err => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ 
                                                error: 'Transaction error: ' + err.message 
                                            });
                                        }
                                        
                                        res.json({ 
                                            message: 'Team advanced successfully',
                                            winnerId,
                                            loserId,
                                            toRound
                                        });
                                    });
                                }
                            );
                        } else {
                            // Commit transaction
                            db.run('COMMIT', err => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ 
                                        error: 'Transaction error: ' + err.message 
                                    });
                                }
                                
                                res.json({ 
                                    message: 'Team advanced successfully',
                                    winnerId,
                                    loserId,
                                    toRound
                                });
                            });
                        }
                    }
                );
            }
        );
    });
});

// Advance a team to the championship game
router.post('/advance-to-final', requireAuth, (req, res) => {
    const { winnerId, loserId } = req.body;
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Update winner - set both is_finalist and round_reached to 6
        db.run(
            'UPDATE tournament_progress SET is_finalist = 1, round_reached = 6 WHERE id = ?',
            [winnerId],
            err => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error updating finalist: ' + err.message });
                }
                
                // Update loser
                db.run(
                    'UPDATE tournament_progress SET is_eliminated = 1 WHERE id = ?',
                    [loserId],
                    err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error updating loser: ' + err.message });
                        }
                        
                        // Commit transaction
                        db.run('COMMIT', err => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ 
                                    error: 'Transaction error: ' + err.message 
                                });
                            }
                            
                            res.json({ 
                                message: 'Team advanced to championship game',
                                winnerId,
                                loserId
                            });
                        });
                    }
                );
            }
        );
    });
});

// Declare the champion
router.post('/declare-champion', requireAuth, (req, res) => {
    const { winnerId, loserId } = req.body;
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Update winner as champion - also set round_reached to 7
        db.run(
            'UPDATE tournament_progress SET is_champion = 1, round_reached = 7 WHERE id = ?',
            [winnerId],
            err => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error updating champion: ' + err.message });
                }
                
                // Update loser as eliminated
                db.run(
                    'UPDATE tournament_progress SET is_eliminated = 1 WHERE id = ?',
                    [loserId],
                    err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error updating loser: ' + err.message });
                        }
                        
                        // Commit transaction
                        db.run('COMMIT', err => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ 
                                    error: 'Transaction error: ' + err.message 
                                });
                            }
                            
                            res.json({ 
                                message: 'Champion declared successfully',
                                winnerId,
                                loserId
                            });
                        });
                    }
                );
            }
        );
    });
});

// Correct an incorrect advancement by swapping winner and loser for a matchup
// Returns the seeds that could face a given seed at a given regional round
function getMatchupGroupSeeds(seed, round) {
    const round2Groups = [[1,16,8,9],[5,12,4,13],[6,11,3,14],[7,10,2,15]];
    const round3Groups = [[1,16,8,9,5,12,4,13],[6,11,3,14,7,10,2,15]];
    if (round === 2) return round2Groups.find(g => g.includes(seed)) || [];
    if (round === 3) return round3Groups.find(g => g.includes(seed)) || [];
    if (round === 4) return [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];
    return [];
}

router.post('/correct-advancement', requireAuth, (req, res) => {
    const { winnerId, loserId, toRound } = req.body;
    const fromRound = toRound - 1;

    // Step 1: get the wrong winner's info
    db.get('SELECT * FROM tournament_progress WHERE id = ?', [loserId], (err, loserRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!loserRow) return res.status(404).json({ error: 'Team not found' });

        const maxRound = loserRow.round_reached;

        // Step 2: get Final Four config if the wrong winner reached round 5+
        const getConfig = (cb) => {
            if (maxRound >= 5) {
                db.get("SELECT value FROM system_settings WHERE key = 'final_four_matchups'", (err, row) => {
                    cb(row ? JSON.parse(row.value) : { semifinal1: ['East','West'], semifinal2: ['South','Midwest'] });
                });
            } else {
                cb(null);
            }
        };

        getConfig((semifinalConfig) => {
            // Step 3: walk rounds toRound..maxRound finding each orphaned victim
            const orphanedIds = [];

            function findForRound(round, done) {
                if (round > maxRound) return done();

                if (round <= 4) {
                    const seeds = getMatchupGroupSeeds(loserRow.seed, round);
                    if (!seeds.length) return findForRound(round + 1, done);
                    const ph = seeds.map(() => '?').join(',');
                    db.get(
                        `SELECT id FROM tournament_progress WHERE region = ? AND seed IN (${ph}) AND round_reached = ? AND is_eliminated = 1 AND id != ?`,
                        [loserRow.region, ...seeds, round, loserRow.id],
                        (err, row) => { if (row) orphanedIds.push(row.id); findForRound(round + 1, done); }
                    );
                } else if (round === 5 && semifinalConfig) {
                    const sf = semifinalConfig.semifinal1.includes(loserRow.region)
                        ? semifinalConfig.semifinal1
                        : semifinalConfig.semifinal2.includes(loserRow.region)
                            ? semifinalConfig.semifinal2
                            : null;
                    if (!sf) return findForRound(round + 1, done);
                    const ph = sf.map(() => '?').join(',');
                    db.get(
                        `SELECT id FROM tournament_progress WHERE region IN (${ph}) AND round_reached = 5 AND is_eliminated = 1 AND id != ?`,
                        [...sf, loserRow.id],
                        (err, row) => { if (row) orphanedIds.push(row.id); findForRound(round + 1, done); }
                    );
                } else if (round === 6) {
                    db.get(
                        `SELECT id FROM tournament_progress WHERE (round_reached = 6 OR is_finalist = 1) AND is_eliminated = 1 AND id != ?`,
                        [loserRow.id],
                        (err, row) => { if (row) orphanedIds.push(row.id); findForRound(round + 1, done); }
                    );
                } else if (round === 7) {
                    db.get(
                        `SELECT id FROM tournament_progress WHERE (round_reached = 7 OR is_champion = 1) AND is_eliminated = 1 AND id != ?`,
                        [loserRow.id],
                        (err, row) => { if (row) orphanedIds.push(row.id); findForRound(round + 1, done); }
                    );
                } else {
                    findForRound(round + 1, done);
                }
            }

            findForRound(toRound, () => {
                // Step 4: apply all updates in a single serialized transaction
                let responded = false;
                const fail = (err) => {
                    if (!responded) { responded = true; db.run('ROLLBACK'); res.status(500).json({ error: err.message }); }
                };

                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');

                    db.run(
                        `UPDATE tournament_progress SET round_reached=?, is_eliminated=0, is_final_four=?, is_finalist=?, is_champion=? WHERE id=?`,
                        [toRound, toRound >= 5 ? 1 : 0, toRound >= 6 ? 1 : 0, toRound >= 7 ? 1 : 0, winnerId],
                        err => { if (err) fail(err); }
                    );

                    db.run(
                        `UPDATE tournament_progress SET round_reached=?, is_eliminated=1, is_final_four=?, is_finalist=?, is_champion=0 WHERE id=?`,
                        [fromRound, fromRound >= 5 ? 1 : 0, fromRound >= 6 ? 1 : 0, loserId],
                        err => { if (err) fail(err); }
                    );

                    orphanedIds.forEach(id => {
                        db.run('UPDATE tournament_progress SET is_eliminated=0 WHERE id=?', [id], err => { if (err) fail(err); });
                    });

                    db.run('COMMIT', err => {
                        if (err) return fail(err);
                        if (!responded) {
                            responded = true;
                            res.json({ message: 'Advancement corrected successfully', winnerId, loserId, toRound });
                        }
                    });
                });
            });
        });
    });
});

// Update all scores based on current tournament progress
router.post('/update-scores', requireAuth, (req, res) => {
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Reset all team scores
        db.run('UPDATE team_selections SET points_earned = 0', err => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Error resetting scores: ' + err.message });
            }
            
            // Get all tournament teams with their progress
            db.all('SELECT * FROM tournament_progress', (err, teams) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error fetching tournament data: ' + err.message });
                }
                
                // Process each team
                let updateCount = 0;
                let errorOccurred = false;
                
                teams.forEach(team => {
                    // Skip teams that lost in the first round
                    if (team.is_eliminated && team.round_reached === 1) {
                        return;
                    }
                    
                    // Calculate points for this team (logic lives in utils/scoring.js)
                    const points = calculatePoints(team);
                    
                    // Update points for all entries that selected this team
                    db.run(
                        `UPDATE team_selections 
                         SET points_earned = ? 
                         WHERE team_name = ? AND region = ?`,
                        [points, team.team_name, team.region],
                        function(err) {
                            if (err) {
                                errorOccurred = true;
                                console.error('Error updating team points:', err.message);
                            } else {
                                updateCount += this.changes;
                            }
                        }
                    );
                });
                
                // Wait a bit to make sure all updates are done
                setTimeout(() => {
                    if (errorOccurred) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Error updating team scores' });
                    }
                    
                    // Update entry total scores
                    db.run(
                        `UPDATE entries 
                         SET score = (
                             SELECT SUM(points_earned) 
                             FROM team_selections 
                             WHERE team_selections.entry_id = entries.id
                         )`,
                        function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Error updating entry scores: ' + err.message });
                            }
                            
                            // Commit transaction
                            db.run('COMMIT', err => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Transaction error: ' + err.message });
                                }
                                
                                res.json({ 
                                    message: 'All scores updated successfully',
                                    teamsUpdated: updateCount,
                                    entriesUpdated: this.changes
                                });
                            });
                        }
                    );
                }, 1000);
            });
        });
    });
});

// Update Final Four matchups
router.post('/final-four-matchups', requireAuth, (req, res) => {
    const { semifinal1, semifinal2 } = req.body;
    
    // Validate inputs
    if (!semifinal1 || !semifinal2 || !Array.isArray(semifinal1) || 
        !Array.isArray(semifinal2) || semifinal1.length !== 2 || semifinal2.length !== 2) {
        return res.status(400).json({ 
            error: 'Invalid matchup data. Each semifinal must have exactly two regions.' 
        });
    }
    
    // Validate that all regions are unique
    const allRegions = [...semifinal1, ...semifinal2];
    const uniqueRegions = new Set(allRegions);
    if (uniqueRegions.size !== 4) {
        return res.status(400).json({ 
            error: 'Invalid matchup data. Each region must appear exactly once.' 
        });
    }
    
    // Create matchups object
    const matchups = {
        semifinal1,
        semifinal2
    };
    
    // Save to database
    db.run(
        "INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)",
        ['final_four_matchups', JSON.stringify(matchups)],
        function(err) {
            if (err) {
                console.error('Error updating Final Four matchups:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            res.json({ 
                success: true,
                message: 'Final Four matchups updated successfully',
                matchups
            });
        }
    );
});
// Reset the tournament
router.post('/reset-tournament', requireAuth, (req, res) => {
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Reset all tournament teams
        db.run(
            `UPDATE tournament_progress SET 
             round_reached = 1, 
             is_eliminated = 0, 
             is_final_four = 0, 
             is_finalist = 0, 
             is_champion = 0`,
            err => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error resetting tournament: ' + err.message });
                }
                
                // Reset all team scores
                db.run('UPDATE team_selections SET points_earned = 0', err => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Error resetting team scores: ' + err.message });
                    }
                    
                    // Reset all entry scores
                    db.run('UPDATE entries SET score = 0', err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error resetting entry scores: ' + err.message });
                        }
                        
                    // Commit transaction
                    db.run('COMMIT', err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Transaction error: ' + err.message });
                    }
                        
                    res.json({ message: 'Tournament reset successfully' });
                    });
                });
            });
        });
    });
});

// Delete an entry
router.delete('/entry/:id', requireAuth, (req, res) => {
    const entryId = req.params.id;
    
    if (!entryId) {
        return res.status(400).json({ error: 'Entry ID is required' });
    }
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Delete team selections first (due to foreign key constraints)
        db.run(
            'DELETE FROM team_selections WHERE entry_id = ?',
            [entryId],
            err => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error deleting team selections: ' + err.message });
                }
                
                // Then delete the entry
                db.run(
                    'DELETE FROM entries WHERE id = ?',
                    [entryId],
                    function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error deleting entry: ' + err.message });
                        }
                        
                        if (this.changes === 0) {
                            db.run('ROLLBACK');
                            return res.status(404).json({ error: 'Entry not found' });
                        }
                        
                        // Commit transaction
                        db.run('COMMIT', err => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Transaction error: ' + err.message });
                            }
                            
                            res.json({ 
                                message: 'Entry deleted successfully',
                                entryId
                            });
                        });
                    }
                );
            }
        );
    });
});

// Get entry status
router.get('/entry-status', requireAuth, (req, res) => {
    db.all(
        "SELECT key, value FROM system_settings WHERE key IN ('entries_open', 'entries_close_reason')",
        (err, rows) => {
            if (err) {
                console.error('Error fetching entry status:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            const settings = {};
            (rows || []).forEach(r => { settings[r.key] = r.value; });
            const entriesOpen = settings['entries_open'] !== undefined ? settings['entries_open'] === 'true' : true;
            const closeReason = settings['entries_close_reason'] || 'deadline_passed';

            res.json({ entriesOpen, closeReason });
        }
    );
});

router.get('/check-times', requireAuth, (req, res) => {
    db.all('SELECT id, player_name, submission_date FROM entries LIMIT 10', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        // Get current server time
        const serverTime = new Date();
        const easternTime = new Date(serverTime.toLocaleString('en-US', {
            timeZone: 'America/New_York'
        }));
        
        res.json({
            serverTimeUTC: serverTime.toISOString(),
            serverTimeLocal: serverTime.toString(),
            easternTime: easternTime.toString(),
            entries: rows
        });
    });
});
// Toggle entry status
router.post('/toggle-entry-status', requireAuth, (req, res) => {
    const { reason } = req.body; // 'not_yet_open' | 'deadline_passed' — only needed when closing

    db.get(
        "SELECT value FROM system_settings WHERE key = 'entries_open'",
        (err, row) => {
            if (err) {
                console.error('Error fetching entry status:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            const currentStatus = row ? row.value === 'true' : true;
            const newStatus = !currentStatus;

            db.run(
                "INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)",
                ['entries_open', newStatus.toString()],
                function(err) {
                    if (err) {
                        console.error('Error updating entry status:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }

                    if (!newStatus && reason) {
                        // Store the close reason
                        db.run(
                            "INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)",
                            ['entries_close_reason', reason],
                            function(err) {
                                if (err) console.error('Error storing close reason:', err);
                            }
                        );
                    } else if (newStatus) {
                        // Clear the close reason when reopening
                        db.run(
                            "DELETE FROM system_settings WHERE key = 'entries_close_reason'",
                            function(err) {
                                if (err) console.error('Error clearing close reason:', err);
                            }
                        );
                    }

                    res.json({
                        entriesOpen: newStatus,
                        closeReason: newStatus ? null : (reason || 'deadline_passed'),
                        message: newStatus ? 'Entries are now open' : 'Entries are now closed'
                    });
                }
            );
        }
    );
});
router.get('/team-visibility', requireAuth, (req, res) => {
    db.get(
        "SELECT value FROM system_settings WHERE key = 'teams_visible'",
        (err, row) => {
            if (err) {
                console.error('Error fetching team visibility status:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Default to false if no setting exists
            const teamsVisible = row ? row.value === 'true' : false;
            
            res.json({ 
                teamsVisible: teamsVisible
            });
        }
    );
});

// Toggle team visibility status
router.post('/toggle-team-visibility', requireAuth, (req, res) => {
    // First, get current status
    db.get(
        "SELECT value FROM system_settings WHERE key = 'teams_visible'",
        (err, row) => {
            if (err) {
                console.error('Error fetching team visibility status:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Default to false if no setting exists
            const currentStatus = row ? row.value === 'true' : false;
            // New status is the opposite
            const newStatus = !currentStatus;
            
            // Update the status
            db.run(
                "INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)",
                ['teams_visible', newStatus.toString()],
                function(err) {
                    if (err) {
                        console.error('Error updating team visibility status:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }
                    
                    res.json({ 
                        teamsVisible: newStatus,
                        message: newStatus ? 'Team selections are now visible to users' : 'Team selections are now hidden from users'
                    });
                }
            );
        }
    );
});
// Get Final Four matchups
router.get('/final-four-matchups', requireAuth, (req, res) => {
    db.get(
        "SELECT value FROM system_settings WHERE key = 'final_four_matchups'",
        (err, row) => {
            if (err) {
                console.error('Error fetching Final Four matchups:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Default matchups if none exist
            const defaultMatchups = {
                semifinal1: ['East', 'West'],
                semifinal2: ['South', 'Midwest']
            };
            
            // Parse the stored JSON value
            let matchups = defaultMatchups;
            if (row && row.value) {
                try {
                    matchups = JSON.parse(row.value);
                } catch (e) {
                    console.error('Error parsing stored matchups:', e);
                }
            }
            
            res.json({ matchups });
        }
    );
});
// ── Clear all entries ────────────────────────────────────────────────────────
router.delete('/clear-entries', requireAuth, (req, res) => {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM team_selections', (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }
            db.run('DELETE FROM entries', (err2) => {
                if (err2) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err2.message });
                }
                db.run('COMMIT', (err3) => {
                    if (err3) return res.status(500).json({ error: err3.message });
                    console.log('All entries cleared by admin');
                    res.json({ success: true, message: 'All entries have been cleared.' });
                });
            });
        });
    });
});

// ── Re-seed the field ────────────────────────────────────────────────────────
router.post('/reseed-teams', requireAuth, (req, res) => {
    const { teams } = req.body;

    if (!Array.isArray(teams) || teams.length !== 64) {
        return res.status(400).json({ error: `Expected exactly 64 teams, got ${teams ? teams.length : 0}.` });
    }

    for (const t of teams) {
        const seed = parseInt(t.seed);
        if (!t.team_name || !t.region || isNaN(seed) || seed < 1 || seed > 16) {
            return res.status(400).json({ error: `Invalid team entry: ${JSON.stringify(t)}` });
        }
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM team_selections', (err) => {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
            db.run('DELETE FROM entries', (err) => {
                if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
                db.run('DELETE FROM tournament_progress', (err) => {
                    if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }

                    const stmt = db.prepare('INSERT INTO tournament_progress (team_name, region, seed, logo_url) VALUES (?, ?, ?, ?)');
                    let insertError = null;
                    for (const t of teams) {
                        stmt.run(t.team_name.trim(), t.region.trim(), parseInt(t.seed), t.logo_url || '', (err) => {
                            if (err) insertError = err;
                        });
                    }
                    stmt.finalize((err) => {
                        if (err || insertError) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: (err || insertError).message });
                        }
                        db.run('COMMIT', (err) => {
                            if (err) return res.status(500).json({ error: err.message });

                            // Keep teams.csv in sync with the DB
                            const csvLines = ['seed,logo_url,team_name,region',
                                ...teams.map(t => `${t.seed},${t.logo_url || ''},${t.team_name.trim()},${t.region.trim()}`)
                            ];
                            fs.writeFile(
                                path.join(__dirname, '../public/teams.csv'),
                                csvLines.join('\n') + '\n',
                                err => { if (err) console.error('Error writing teams.csv after reseed:', err); }
                            );

                            console.log(`Bracket reseeded with ${teams.length} teams. All entries cleared.`);
                            res.json({ success: true, message: `Bracket reseeded with ${teams.length} teams. All previous entries have been cleared.` });
                        });
                    });
                });
            });
        });
    });
});

// ── Commissioner's Banner ──────────────────────────────────────────────────
router.get('/banner', requireAuth, (req, res) => {
    db.get("SELECT value FROM system_settings WHERE key = 'commissioner_banner'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ banner: row ? row.value : '' });
    });
});

router.put('/banner', requireAuth, (req, res) => {
    const { banner } = req.body;
    if (banner === undefined) return res.status(400).json({ error: 'banner field required' });

    const text = banner.trim();
    if (!text) {
        db.run("DELETE FROM system_settings WHERE key = 'commissioner_banner'", err => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, banner: '' });
        });
    } else {
        db.run(
            "INSERT INTO system_settings (key, value) VALUES ('commissioner_banner', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [text],
            err => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, banner: text });
            }
        );
    }
});

module.exports = router;