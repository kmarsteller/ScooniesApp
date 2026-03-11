// routes/bracket.js — public read-only bracket data
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

router.get('/', (req, res) => {
    db.get("SELECT value FROM system_settings WHERE key = 'final_four_matchups'", (err, ffRow) => {
        const finalFourMatchups = ffRow ? JSON.parse(ffRow.value) : null;

        db.all('SELECT * FROM tournament_progress ORDER BY region, seed', (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            res.json({ teams: rows, finalFourMatchups });
        });
    });
});

module.exports = router;
