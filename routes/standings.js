// routes/standings.js
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Update the standings.js route to respect the team visibility setting

// Get current standings
router.get('/', (req, res) => {
    // First, check if team selections should be visible
    db.get(
        "SELECT value FROM system_settings WHERE key = 'teams_visible'",
        (err, visibilityRow) => {
            if (err) {
                console.error('Error checking team visibility:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Default to false if no setting exists
            const teamsVisible = visibilityRow ? visibilityRow.value === 'true' : false;
            
            // Get all entries with scores
            db.all(
                `SELECT id, player_name, email, nickname, score, has_paid
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
                                `SELECT ts.*, tp.is_eliminated, tp.round_reached
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
                                    
                                    // If teams should be hidden, indicate that in the response
                                    if (!teamsVisible) {
                                        // Count total teams but don't reveal them
                                        const teamCount = teams.length;
                                        entry.teamsHidden = true;
                                        entry.teamCount = teamCount;
                                        entry.teams = []; // Empty array as we're hiding teams
                                    } else {
                                        // Add teams to entry if they should be visible
                                        entry.teamsHidden = false;
                                        entry.teams = teams;
                                    }
                                    
                                    resolve(entry);
                                }
                            );
                        });
                    });
                    
                    // Wait for all entries to be processed
                    Promise.all(entryPromises)
                        .then(completedEntries => {
                            // Compute tournament status: games completed per round
                            db.all(
                                `SELECT round_reached, COUNT(*) as games_done
                                 FROM tournament_progress
                                 WHERE is_eliminated = 1
                                 GROUP BY round_reached`,
                                (err, roundData) => {
                                    const TOTAL_GAMES  = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 };
                                    const ROUND_NAMES  = { 1: 'Round of 64', 2: 'Round of 32', 3: 'Sweet 16', 4: 'Elite Eight', 5: 'Final Four', 6: 'Championship' };

                                    let tournamentStatus = null;
                                    for (let r = 1; r <= 6; r++) {
                                        const row = (roundData || []).find(x => x.round_reached === r);
                                        const done  = row ? row.games_done : 0;
                                        const total = TOTAL_GAMES[r];
                                        if (done < total) {
                                            tournamentStatus = { currentRound: r, gamesCompleted: done, totalGames: total, roundName: ROUND_NAMES[r] };
                                            break;
                                        }
                                    }
                                    // All 63 games done → champion crowned
                                    if (!tournamentStatus) {
                                        tournamentStatus = { currentRound: null, gamesCompleted: 63, totalGames: 63, roundName: 'Complete' };
                                    }

                                    res.json({
                                        entries: completedEntries,
                                        teamsVisible,
                                        tournamentStatus
                                    });
                                }
                            );
                        })
                        .catch(err => {
                            res.status(500).json({ error: 'Error fetching team data: ' + err.message });
                        });
                }
            );
        }
    );
});

module.exports = router;