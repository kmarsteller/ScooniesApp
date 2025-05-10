const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Get tournament data
router.get('/tournament', (req, res) => {
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
    
    db.get(
        'SELECT id FROM admin_users WHERE username = ? AND password_hash = ?',
        [username, password],
        (err, row) => {
            if (err) {
                console.error('Database error during login:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!row) {
                console.log('Invalid credentials for user:', username);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            console.log('Login successful for user:', username);
            
            // In a real app, you would set a session or generate a JWT token here
            res.json({
                success: true,
                message: 'Login successful'
            });
        }
    );
});

// Update an entry
router.put('/entry/:id', (req, res) => {
    const entryId = req.params.id;
    const { player_name, nickname, email } = req.body;
    
    if (!entryId || !player_name || !nickname || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Update the entry
        db.run(
            'UPDATE entries SET player_name = ?, nickname = ?, email = ? WHERE id = ?',
            [player_name, nickname, email, entryId],
            function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error updating entry: ' + err.message });
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
                        message: 'Entry updated successfully',
                        entryId
                    });
                });
            }
        );
    });
});

// Get all entries (for admin panel)
router.get('/entries', (req, res) => {
    console.log('GET /api/admin/entries endpoint called at', new Date().toISOString());
    
    // Use a promise-based approach for more reliable handling
    new Promise((resolve, reject) => {
        db.all(
            `SELECT id, player_name, email, nickname, score, submission_date
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
router.post('/advance-team', (req, res) => {
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
router.post('/advance-to-final', (req, res) => {
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
router.post('/declare-champion', (req, res) => {
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

// Update all scores based on current tournament progress
router.post('/update-scores', (req, res) => {
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
                    
                    // Calculate points for this team
                    let points = 0;
                    const seed = team.seed;
                    
                    // Base case - team won at least 1 game (reached Round of 32)
                    if (team.round_reached >= 2) {
                        // Round of 32 points
                        points += seed * 1;
                    }
                    
                    // Team reached Sweet 16
                    if (team.round_reached >= 3) {
                        points += seed * 2;
                    }
                    
                    // Team reached Elite 8
                    if (team.round_reached >= 4) {
                        points += seed * 3;
                    }
                    
                    // Team reached Final Four
                    if (team.round_reached >= 5 || team.is_final_four) {
                        points += seed * 4; // Points for winning Elite 8
                        points += 5;        // Final Four bonus
                    }
                    
                    // Team reached Championship Game
                    if (team.round_reached >= 6 || team.is_finalist) {
                        points += seed * 5; // Points for winning Final Four
                        points += 10;       // Championship bonus
                    }
                    
                    // Team won Championship
                    if (team.round_reached >= 7 || team.is_champion) {
                        points += seed * 6; // Points for winning Championship
                        points += 15;       // Champion bonus
                    }
                    
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

// Undo a team advancement
router.post('/undo-advancement', (req, res) => {
    const { winnerId, loserId, previousRound } = req.body;
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Update the current "winner" back to their previous state
        db.run(
            `UPDATE tournament_progress SET 
             round_reached = ?, 
             is_eliminated = 0, 
             is_final_four = 0, 
             is_finalist = 0, 
             is_champion = 0 
             WHERE id = ?`,
            [previousRound, loserId],
            err => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error updating team: ' + err.message });
                }
                
                // Update the current "loser" (original winner) to their previous state
                db.run(
                    `UPDATE tournament_progress SET 
                     round_reached = ?, 
                     is_eliminated = 1, 
                     is_final_four = 0, 
                     is_finalist = 0, 
                     is_champion = 0 
                     WHERE id = ?`,
                    [previousRound, winnerId],
                    err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error updating team: ' + err.message });
                        }
                        
                        // Commit transaction
                        db.run('COMMIT', err => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Transaction error: ' + err.message });
                            }
                            
                            res.json({ 
                                message: 'Advancement undone successfully',
                                previousWinnerId: winnerId,
                                newWinnerId: loserId
                            });
                        });
                    }
                );
            }
        );
    });
});

// Reset the tournament
router.post('/reset-tournament', (req, res) => {
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
            }
        );
    });
});

// Delete an entry
router.delete('/entry/:id', (req, res) => {
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

module.exports = router;