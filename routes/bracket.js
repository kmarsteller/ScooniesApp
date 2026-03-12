// routes/bracket.js — public read-only bracket data
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

router.get('/', (req, res) => {
    db.get("SELECT value FROM system_settings WHERE key = 'final_four_matchups'", (err, ffRow) => {
        if (err) {
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }

        let finalFourMatchups = null;
        if (ffRow && ffRow.value) {
            try {
                finalFourMatchups = JSON.parse(ffRow.value);
            } catch (e) {
                console.error('Invalid final_four_matchups JSON in settings:', e.message);
            }
        }

        db.all('SELECT * FROM tournament_progress ORDER BY region, seed', (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            res.json({ teams: rows, finalFourMatchups });
        });
    });
});

module.exports = router;
