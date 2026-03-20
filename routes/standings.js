// routes/standings.js
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calcMaxScore } = require('../lib/maxScoreCalculator');

// Get current standings
router.get('/', (req, res) => {
    // Fetch all settings we need in one query
    db.all(
        "SELECT key, value FROM system_settings WHERE key IN ('teams_visible', 'entries_open')",
        (err, settingRows) => {
            if (err) {
                console.error('Error checking settings:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            const settings = {};
            (settingRows || []).forEach(r => { settings[r.key] = r.value; });
            const teamsVisible = settings['teams_visible'] === 'true';

            // Single query: all entries + their team selections + tournament progress
            db.all(
                `SELECT
                    e.id, e.player_name, e.email, e.nickname, e.score, e.has_paid,
                    ts.id         AS ts_id,
                    ts.team_name, ts.seed, ts.region, ts.cost, ts.points_earned,
                    tp.logo_url, tp.is_eliminated, tp.round_reached
                 FROM entries e
                 LEFT JOIN team_selections ts ON ts.entry_id = e.id
                 LEFT JOIN tournament_progress tp
                     ON ts.team_name = tp.team_name AND ts.region = tp.region
                 ORDER BY e.score DESC, e.id, ts.seed`,
                (err, rows) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }

                    // Group flat rows into entry objects
                    const entryMap = new Map();
                    for (const row of rows) {
                        if (!entryMap.has(row.id)) {
                            entryMap.set(row.id, {
                                id: row.id,
                                player_name: row.player_name,
                                email: row.email,
                                nickname: row.nickname,
                                score: row.score,
                                has_paid: row.has_paid,
                                teams: []
                            });
                        }
                        if (row.ts_id !== null) {
                            entryMap.get(row.id).teams.push({
                                id: row.ts_id,
                                team_name: row.team_name,
                                seed: row.seed,
                                region: row.region,
                                cost: row.cost,
                                points_earned: row.points_earned,
                                logo_url: row.logo_url,
                                is_eliminated: row.is_eliminated,
                                round_reached: row.round_reached
                            });
                        }
                    }

                    const entries = Array.from(entryMap.values());

                    // Apply teams visibility
                    const completedEntries = entries.map(entry => {
                        if (!teamsVisible) {
                            return {
                                ...entry,
                                teamsHidden: true,
                                teamCount: entry.teams.length,
                                teams: []
                            };
                        }
                        return { ...entry, teamsHidden: false };
                    });

                    // Compute tournament status
                    db.all(
                        `SELECT round_reached, COUNT(*) as games_done
                         FROM tournament_progress
                         WHERE is_eliminated = 1
                         GROUP BY round_reached`,
                        (err, roundData) => {
                            const TOTAL_GAMES = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 };
                            const ROUND_NAMES = { 1: 'Round of 64', 2: 'Round of 32', 3: 'Sweet 16', 4: 'Elite Eight', 5: 'Final Four', 6: 'Championship' };

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
                            if (!tournamentStatus) {
                                tournamentStatus = { currentRound: null, gamesCompleted: 63, totalGames: 63, roundName: 'Complete' };
                            }

                            res.json({ entries: completedEntries, teamsVisible, tournamentStatus });
                        }
                    );
                }
            );
        }
    );
});

// Max possible score for an entry (public)
router.get('/max-score/:entryId', (req, res) => {
    const { entryId } = req.params;
    db.all(
        `SELECT ts.*, tp.is_eliminated, tp.round_reached
         FROM team_selections ts
         LEFT JOIN tournament_progress tp ON ts.team_name = tp.team_name AND ts.region = tp.region
         WHERE ts.entry_id = ?`,
        [entryId], (err, picks) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!picks.length) return res.status(404).json({ error: 'Entry not found' });

        db.all('SELECT * FROM tournament_progress', [], (err, allTeams) => {
            if (err) return res.status(500).json({ error: err.message });

            db.get("SELECT value FROM system_settings WHERE key = 'final_four_matchups'", [], (err, row) => {
                const ffMatchups = row
                    ? JSON.parse(row.value)
                    : { semifinal1: ['East', 'West'], semifinal2: ['South', 'Midwest'] };

                const result = calcMaxScore(picks, allTeams, ffMatchups);
                res.json({ ...result, ffMatchups });
            });
        });
    });
});

module.exports = router;
