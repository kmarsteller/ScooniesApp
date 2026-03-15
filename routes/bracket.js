// routes/bracket.js — public read-only bracket data
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

const REGIONS = ['South', 'West', 'East', 'Midwest'];

function buildPreTourneyTeams() {
    const teams = [];
    for (const region of REGIONS) {
        for (let seed = 1; seed <= 16; seed++) {
            teams.push({
                team_name: 'TBD',
                region,
                seed,
                logo_url: '/images/Scoonies.jpg',
                is_eliminated: 0,
                round_reached: 1
            });
        }
    }
    return teams;
}

router.get('/', (req, res) => {
    db.all(
        "SELECT key, value FROM system_settings WHERE key IN ('final_four_matchups', 'entries_open', 'entries_close_reason')",
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            const settings = {};
            (rows || []).forEach(r => { settings[r.key] = r.value; });

            let finalFourMatchups = null;
            if (settings['final_four_matchups']) {
                try {
                    finalFourMatchups = JSON.parse(settings['final_four_matchups']);
                } catch (e) {
                    console.error('Invalid final_four_matchups JSON in settings:', e.message);
                }
            }

            const entriesOpen = settings['entries_open'] !== undefined ? settings['entries_open'] === 'true' : true;
            const closeReason = settings['entries_close_reason'];
            const usePreTourney = !entriesOpen && closeReason === 'not_yet_open';

            if (usePreTourney) {
                return res.json({ teams: buildPreTourneyTeams(), finalFourMatchups: null });
            }

            db.all('SELECT * FROM tournament_progress ORDER BY region, seed', (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error: ' + err.message });
                }
                res.json({ teams: rows, finalFourMatchups });
            });
        }
    );
});

module.exports = router;
