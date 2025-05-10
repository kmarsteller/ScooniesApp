
// Update scores based on NCAA tournament results
router.post('/update-scores', (req, res) => {
    // In a real app, verify admin JWT token here
    
    const { advancingTeams } = req.body;
    
    if (!advancingTeams || !Array.isArray(advancingTeams)) {
        return res.status(400).json({ error: 'Advancing teams data is required' });
    }
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Reset all scores
        db.run('UPDATE entries SET score = 0', err => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Error resetting scores' });
            }
            
            // Reset team points earned
            db.run('UPDATE team_selections SET points_earned = 0', err => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error resetting team points' });
                }
                
                // For each advancing team, update points earned
                // Points earned formula: seed value * advancement round multiplier
                const updateStmt = db.prepare(
                    `UPDATE team_selections 
                     SET points_earned = ? 
                     WHERE team_name = ? AND region = ?`
                );
                
                let hasError = false;
                
                advancingTeams.forEach(team => {
                    const { teamName, region, seed, roundReached } = team;
                    
                    // Calculate points based on seed and round reached
                    // Round multipliers: 1 (Round of 32), 2 (Sweet 16), 4 (Elite 8), 8 (Final 4), 16 (Championship)
                    const roundMultiplier = Math.pow(2, roundReached - 1);
                    const pointsEarned = seed * roundMultiplier;
                    
                    updateStmt.run([pointsEarned, teamName, region], err => {
                        if (err) {
                            hasError = true;
                        }
                    });
                });
                
                updateStmt.finalize();
                
                if (hasError) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Error updating team points' });
                }
                
                // Update entry scores based on team points
                db.run(
                    `UPDATE entries 
                     SET score = (
                         SELECT SUM(points_earned) 
                         FROM team_selections 
                         WHERE team_selections.entry_id = entries.id
                     )`,
                    err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Error updating entry scores' });
                        }
                        
                        // Commit transaction
                        db.run('COMMIT', err => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Transaction error' });
                            }
                            
                            res.json({
                                success: true,
                                message: 'Scores updated successfully'
                            });
                        });
                    }
                );
            });
        });
    });
}); 
