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

// Who picked this team? — respects teams_visible setting
router.get('/picks', (req, res) => {
    const { team, region } = req.query;
    if (!team || !region) {
        return res.status(400).json({ error: 'team and region are required' });
    }

    db.get("SELECT value FROM system_settings WHERE key = 'teams_visible'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        const teamsVisible = row ? row.value === 'true' : false;
        if (!teamsVisible) {
            return res.json({ picks: [], hidden: true });
        }

        db.all(
            `SELECT e.nickname, e.player_name, e.score
             FROM team_selections ts
             JOIN entries e ON ts.entry_id = e.id
             WHERE ts.team_name = ? AND ts.region = ?
             ORDER BY e.score DESC`,
            [team, region],
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ picks: rows, hidden: false });
            }
        );
    });
});

// Public read of commissioner banner
router.get('/banner', (req, res) => {
    db.all(
        "SELECT key, value FROM system_settings WHERE key IN ('commissioner_banner', 'commissioner_banner_enabled')",
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            const enabled = map['commissioner_banner_enabled'] !== 'false';
            res.json({ banner: enabled ? (map['commissioner_banner'] || '') : '' });
        }
    );
});

// Public read of standings banner
router.get('/standings-banner', (req, res) => {
    db.all(
        "SELECT key, value FROM system_settings WHERE key IN ('standings_banner', 'standings_banner_color', 'standings_banner_text_color', 'standings_banner_enabled')",
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            const enabled = map['standings_banner_enabled'] !== 'false';
            res.json({
                banner:    enabled ? (map['standings_banner'] || '') : '',
                color:     map['standings_banner_color'] || '#ff00ff',
                textColor: map['standings_banner_text_color'] || '#ffffff',
            });
        }
    );
});

module.exports = router;
