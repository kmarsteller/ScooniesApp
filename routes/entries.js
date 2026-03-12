// Update the entries.js route handler
const express = require('express');
const router = express.Router();
const { db, getCurrentEasternTime } = require('../db/database');
const { sendEmail } = require('../services/email-service');

// Check if entries are open
router.get('/status', (req, res) => {
    db.get(
        "SELECT value FROM system_settings WHERE key = 'entries_open'",
        (err, row) => {
            if (err) {
                console.error('Error fetching entry status:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Default to true if no setting exists
            const entriesOpen = row ? row.value === 'true' : true;
            
            res.json({ 
                entriesOpen: entriesOpen
            });
        }
    );
});

/// Submit a new entry
router.post('/', (req, res) => {
    const currentEasternTime = getCurrentEasternTime();
    const { playerName, email, nickname, selectedTeams } = req.body;

    // Basic validation
    if (!playerName || !email || !nickname || !selectedTeams || !selectedTeams.length) {
        return res.status(400).json({ error: 'All fields are required including at least one team selection' });
    }

    // Enforce 200 points exactly
    const totalPoints = selectedTeams.reduce((sum, team) => sum + team.cost, 0);
    if (totalPoints !== 200) {
        return res.status(400).json({ error: `Entry must use exactly 200 points. Currently using ${totalPoints} points.` });
    }

    // Check entries open
    db.get("SELECT value FROM system_settings WHERE key = 'entries_open'", (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
        const entriesOpen = row ? row.value === 'true' : true;
        if (!entriesOpen) return res.status(403).json({ error: 'Entry submissions are closed' });

        // Check for duplicate: same player name + email + entry nickname
        db.get(
            'SELECT id FROM entries WHERE player_name = ? AND email = ? AND nickname = ?',
            [playerName, email, nickname],
            (err, existing) => {
                if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
                if (existing) {
                    return res.status(409).json({
                        error: `An entry named "${nickname}" already exists for ${playerName} (${email}). Please choose a different entry name.`
                    });
                }

                // Insert entry + team selections in a transaction
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');

                    db.run(
                        'INSERT INTO entries (player_name, email, nickname, score, submission_date, has_paid) VALUES (?, ?, ?, ?, ?, ?)',
                        [playerName, email, nickname, 0, currentEasternTime, 0],
                        function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Error saving entry: ' + err.message });
                            }

                            const entryId = this.lastID;
                            const teamInsertStmt = db.prepare(
                                'INSERT INTO team_selections (entry_id, team_name, seed, region, cost) VALUES (?, ?, ?, ?, ?)'
                            );

                            let hasError = false;
                            let errorMessage = '';

                            selectedTeams.forEach(team => {
                                teamInsertStmt.run(
                                    [entryId, team.teamName, team.seed, team.region, team.cost],
                                    err => {
                                        if (err) { hasError = true; errorMessage = err.message; }
                                    }
                                );
                            });

                            teamInsertStmt.finalize(err => {
                                if (err || hasError) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({
                                        error: 'Error saving team selections: ' + (errorMessage || (err && err.message))
                                    });
                                }

                                db.run('COMMIT', err => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Transaction error: ' + err.message });
                                    }

                                    res.status(201).json({ message: 'Entry submitted successfully', entryId });

                                    // Send confirmation email (fire and forget)
                                    sendConfirmationEmail(playerName, email, nickname, selectedTeams);
                                });
                            });
                        }
                    );
                });
            }
        );
    });
});

const SITE_URL = (process.env.SITE_URL || 'https://scoonies.com').replace(/\/$/, '');

function teamLogoUrl(teamName) {
    const filename = teamName
        .toLowerCase()
        .replace(/[''']/g, '-')
        .replace(/&/g, ' ')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return `${SITE_URL}/images/logos/${filename}.png`;
}

function sendConfirmationEmail(playerName, email, nickname, selectedTeams) {
    // Group teams by region
    const regions = {};
    selectedTeams.forEach(team => {
        if (!regions[team.region]) regions[team.region] = [];
        regions[team.region].push(team);
    });

    // Sort each region by seed
    Object.values(regions).forEach(teams => teams.sort((a, b) => a.seed - b.seed));

    const totalCost = selectedTeams.reduce((sum, t) => sum + t.cost, 0);

    // --- Plain text version ---
    let text = `Hi ${playerName},\n\n`;
    text += `We've received your Scoonies entry! Here's a summary:\n\n`;
    text += `Entry Name: ${nickname}\n`;
    text += `Submitted by: ${playerName}\n\n`;
    text += `YOUR PICKS\n${'─'.repeat(40)}\n`;
    Object.entries(regions).forEach(([region, teams]) => {
        text += `\n${region.toUpperCase()}\n`;
        teams.forEach(t => {
            text += `  #${t.seed} ${t.teamName} — ${t.cost} pts\n`;
        });
    });
    text += `\n${'─'.repeat(40)}\n`;
    text += `Total Points Used: ${totalCost} / 200\n\n`;
    text += `HOW TO PAY\n${'─'.repeat(40)}\n`;
    text += `Entry fee: $20 per entry\n`;
    text += `  • Venmo: @Brian-Swarts\n`;
    text += `  • PayPal: paypal.me/bswarts2\n`;
    text += `Please send payment before the tournament starts.\n`;
    text += `⚠️  Entries that have not been paid by tipoff will be deleted.\n\n`;
    text += `Good luck!\n— The Scoonies\n`;

    // --- HTML version ---
    const scooniesLogoSrc = `${SITE_URL}/images/Scoonies.jpg`;

    let teamsHtml = '';
    Object.entries(regions).forEach(([region, teams]) => {
        teamsHtml += `
        <tr><td colspan="3" style="background:#dc3545;color:#fff;font-weight:bold;padding:8px 12px;font-size:13px;letter-spacing:1px;">
            ${region.toUpperCase()}
        </td></tr>`;
        teams.forEach(t => {
            const logoImg = `<img src="${teamLogoUrl(t.teamName)}" width="28" height="28" style="vertical-align:middle;margin-right:8px;object-fit:contain;" alt="">`;
            teamsHtml += `
        <tr>
            <td style="padding:7px 12px;border-bottom:1px solid #eee;color:#555;">#${t.seed}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #eee;font-weight:500;">${logoImg}${t.teamName}</td>
            <td style="padding:7px 12px;border-bottom:1px solid #eee;text-align:right;">${t.cost} pts</td>
        </tr>`;
        });
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:#fff;padding:24px 32px;text-align:center;border-bottom:3px solid #dc3545;">
      <img src="${scooniesLogoSrc}" alt="The Scoonies" style="max-height:80px;max-width:280px;object-fit:contain;">
      <p style="margin:10px 0 0;color:#999;font-size:14px;">${new Date().getFullYear()} Tournament Challenge</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="font-size:16px;color:#333;">Hi <strong>${playerName}</strong>,</p>
      <p style="color:#555;">We've received your entry — you're in! Here's a summary of what you submitted.</p>

      <!-- Entry info -->
      <div style="background:#fff5f5;border-left:4px solid #dc3545;border-radius:4px;padding:14px 18px;margin:20px 0;">
        <p style="margin:0 0 6px;font-size:13px;color:#999;text-transform:uppercase;letter-spacing:1px;">Entry Details</p>
        <p style="margin:0;font-size:18px;font-weight:bold;color:#dc3545;">${nickname}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#555;">Submitted by ${playerName}</p>
      </div>

      <!-- Picks table -->
      <h3 style="color:#dc3545;margin:24px 0 10px;">Your Picks</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f4f4f4;">
            <th style="padding:8px 12px;text-align:left;color:#777;font-weight:600;">Seed</th>
            <th style="padding:8px 12px;text-align:left;color:#777;font-weight:600;">Team</th>
            <th style="padding:8px 12px;text-align:right;color:#777;font-weight:600;">Cost</th>
          </tr>
        </thead>
        <tbody>
          ${teamsHtml}
          <tr style="background:#fff5f5;">
            <td colspan="2" style="padding:10px 12px;font-weight:bold;color:#dc3545;">Total Points Used</td>
            <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#dc3545;">${totalCost} / 200</td>
          </tr>
        </tbody>
      </table>

      <!-- Payment reminder -->
      <div style="margin:28px 0 0;background:#fff8e1;border-left:4px solid #f5a623;border-radius:4px;padding:16px 18px;">
        <p style="margin:0 0 8px;font-weight:bold;color:#b07d00;font-size:15px;">💰 Payment Required — $20 per entry</p>
        <p style="margin:0 0 10px;color:#555;font-size:14px;">Please send <strong>$20</strong> to Brian Swarts before the tournament begins:</p>
        <p style="margin:0 0 6px;font-size:14px;">
          <a href="https://venmo.com/Brian-Swarts" style="color:#dc3545;font-weight:bold;">Venmo: @Brian-Swarts</a>
        </p>
        <p style="margin:0 0 10px;font-size:14px;">
          <a href="https://paypal.me/bswarts2" style="color:#dc3545;font-weight:bold;">PayPal: paypal.me/bswarts2</a>
        </p>
        <p style="margin:8px 0 0;color:#c0392b;font-size:13px;font-weight:bold;">⚠️ Entries that have not been paid by tipoff will be deleted.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f4f4f4;padding:18px 32px;text-align:center;border-top:1px solid #ddd;">
      <p style="margin:0;font-size:13px;color:#999;">Good luck! — The Scoonies &nbsp;|&nbsp; <a href="mailto:thescoonies.basketball@gmail.com" style="color:#dc3545;">thescoonies.basketball@gmail.com</a></p>
    </div>

  </div>
</body>
</html>`;

    sendEmail(email, `Your Scoonies Entry: ${nickname}`, text, html)
        .then(result => {
            if (result.success) {
                console.log(`Confirmation email sent to ${email} for entry "${nickname}"`);
            } else {
                console.error(`Failed to send confirmation email to ${email}:`, result.error);
            }
        });
}

module.exports = router;