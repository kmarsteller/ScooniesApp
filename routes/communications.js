// routes/communications.js
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { playersDb } = require('../db/players-db');
const emailService = require('../services/email-service');

const SITE_URL = (process.env.SITE_URL || 'https://scoonies.com').replace(/\/$/, '');

function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Wrap any HTML body content in the standard Scoonies branded email shell
function brandedHtml(title, bodyHtml) {
    const logoSrc = `${SITE_URL}/images/Scoonies.jpg`;
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:#fff;padding:24px 32px;text-align:center;border-bottom:3px solid #dc3545;">
      <img src="${logoSrc}" alt="The Scoonies" style="max-height:80px;max-width:280px;object-fit:contain;">
      <p style="margin:10px 0 0;color:#999;font-size:14px;">${new Date().getFullYear()} Tournament Challenge</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <h2 style="color:#dc3545;margin:0 0 18px;">${title}</h2>
      ${bodyHtml}
    </div>

    <!-- Footer -->
    <div style="background:#f4f4f4;padding:18px 32px;text-align:center;border-top:1px solid #ddd;">
      <p style="margin:0 0 4px;font-size:13px;color:#999;">The Scoonies &nbsp;|&nbsp; <a href="mailto:thescoonies.basketball@gmail.com" style="color:#dc3545;">thescoonies.basketball@gmail.com</a></p>
      <p style="margin:0;font-size:12px;color:#bbb;">&copy; ${new Date().getFullYear()} Scoonies.com</p>
    </div>

  </div>
</body>
</html>`;
}

// Get all unique recipients (one row per email), including all nicknames for multi-entry people.
router.get('/recipients', requireAuth, (req, res) => {
    db.all(
        `SELECT id, player_name, email, nickname, has_paid FROM entries ORDER BY player_name`,
        (err, entries) => {
            if (err) return res.status(500).json({ error: 'Database error: ' + err.message });

            const byEmail = new Map();
            entries.forEach(entry => {
                const key = entry.email.toLowerCase();
                if (!byEmail.has(key)) {
                    byEmail.set(key, { ...entry, nicknames: [] });
                }
                byEmail.get(key).nicknames.push(entry.nickname);
            });

            // Build display label: if multiple entries, list all nicknames
            const uniqueEntries = Array.from(byEmail.values()).map(e => ({
                ...e,
                nickname: e.nicknames.length > 1
                    ? e.nicknames.join(', ')   // shown in UI as "Entry A, Entry B"
                    : e.nicknames[0],
                multiEntry: e.nicknames.length > 1,
            }));

            res.json({ entries: uniqueEntries });
        }
    );
});

// Send email to specific recipients
router.post('/send', requireAuth, async (req, res) => {
    const { recipients, subject, message, messageType } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Recipients are required' });
    }
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
    }
    
    try {
        const results = {
            successful: [],
            failed: []
        };

        // Fetch all entries for these recipients and group by email,
        // collecting every nickname so {all_nicknames} works correctly
        const participantDetails = await new Promise((resolve, reject) => {
            db.all(
                `SELECT player_name, email, nickname FROM entries WHERE email IN (${recipients.map(() => '?').join(',')})`,
                recipients,
                (err, rows) => {
                    if (err) return reject(err);
                    const map = {};
                    rows.forEach(row => {
                        if (!map[row.email]) {
                            map[row.email] = { name: row.player_name, email: row.email, nickname: row.nickname, _nicknames: [] };
                        }
                        map[row.email]._nicknames.push(row.nickname);
                    });
                    // Build formatted all_nicknames string
                    Object.values(map).forEach(d => {
                        d.all_nicknames = d._nicknames.map(n => `"${n}"`).join(', ');
                    });
                    resolve(map);
                }
            );
        });

        // Send to each recipient with personalized message
        for (const recipient of recipients) {
            try {
                const details = participantDetails[recipient] || {
                    name: '', nickname: '', email: recipient, all_nicknames: ''
                };

                // Replace placeholders
                let personalizedMessage = message;
                ['name', 'nickname', 'email', 'all_nicknames'].forEach(key => {
                    personalizedMessage = personalizedMessage.replace(
                        new RegExp(`\\{${key}\\}`, 'g'),
                        details[key] || ''
                    );
                });
                
                // Build branded HTML email
                const normalizedMessage = personalizedMessage.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const bodyHtml = messageType === 'html'
                    ? normalizedMessage
                    : `<p style="color:#333;font-size:15px;line-height:1.6;">${normalizedMessage.replace(/\n\n/g, '</p><p style="color:#333;font-size:15px;line-height:1.6;">').replace(/\n/g, '<br>')}</p>`;
                const htmlMessage = brandedHtml(subject, bodyHtml);

                const result = await emailService.sendEmail(
                    recipient,
                    subject,
                    normalizedMessage, // Plain text version
                    htmlMessage // HTML version
                );
                
                if (result.success) {
                    results.successful.push(recipient);
                } else {
                    results.failed.push({ email: recipient, error: result.error });
                }
            } catch (error) {
                results.failed.push({ email: recipient, error: error.message });
            }
        }
        
        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Error sending communications:', error);
        res.status(500).json({ error: 'Error sending communications: ' + error.message });
    }
});

// Send email to all participants
router.post('/send-all', requireAuth, async (req, res) => {
    const { subject, message, messageType, filter } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
    }
    
    try {
        // Build query based on filter
        let query = `SELECT id, player_name, email, nickname FROM entries`;
        const params = [];
        
        if (filter === 'paid') {
            query += ` WHERE has_paid = 1`;
        } else if (filter === 'unpaid') {
            query += ` WHERE has_paid = 0`;
        }
        
        // Get all participants, grouping multiple entries per email so
        // {all_nicknames} lists every entry for that person
        const allParticipants = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        // Group by email, collecting all nicknames
        const byEmail = new Map();
        allParticipants.forEach(p => {
            if (!byEmail.has(p.email)) {
                byEmail.set(p.email, { name: p.player_name, email: p.email, nickname: p.nickname, _nicknames: [] });
            }
            byEmail.get(p.email)._nicknames.push(p.nickname);
        });
        byEmail.forEach(d => {
            d.all_nicknames = d._nicknames.map(n => `"${n}"`).join(', ');
        });

        const participants = Array.from(byEmail.values());
        
        if (participants.length === 0) {
            return res.json({ 
                success: true, 
                message: 'No recipients found matching criteria',
                results: { successful: [], failed: [] }
            });
        }
        
        const results = {
            successful: [],
            failed: []
        };
        
        // Send to each participant with personalized message
        for (const participant of participants) {
            try {
                // Replace placeholders with real values
                let personalizedMessage = message;
                ['name', 'nickname', 'email', 'all_nicknames'].forEach(key => {
                    personalizedMessage = personalizedMessage.replace(
                        new RegExp(`\\{${key}\\}`, 'g'),
                        participant[key] || ''
                    );
                });
                
                // Build branded HTML email
                const normalizedMessage = personalizedMessage.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const bodyHtml = messageType === 'html'
                    ? normalizedMessage
                    : `<p style="color:#333;font-size:15px;line-height:1.6;">${normalizedMessage.replace(/\n\n/g, '</p><p style="color:#333;font-size:15px;line-height:1.6;">').replace(/\n/g, '<br>')}</p>`;
                const htmlMessage = brandedHtml(subject, bodyHtml);

                const result = await emailService.sendEmail(
                    participant.email,
                    subject,
                    normalizedMessage, // Plain text version
                    htmlMessage // HTML version
                );
                
                if (result.success) {
                    results.successful.push(participant.email);
                } else {
                    results.failed.push({ email: participant.email, error: result.error });
                }
            } catch (error) {
                results.failed.push({ email: participant.email, error: error.message });
            }
        }
        
        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Error sending communications:', error);
        res.status(500).json({ error: 'Error sending communications: ' + error.message });
    }
});
// Send payment reminders to unpaid participants
router.post('/send-payment-reminders', requireAuth, async (req, res) => {
    const { subject, message } = req.body;
    
    try {
        // Get all unpaid entries
        db.all(
            `SELECT player_name, email, nickname FROM entries WHERE has_paid = 0`,
            async (err, allEntries) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error: ' + err.message });
                }
                
                // De-duplicate by email address
                const uniqueEmails = new Map();
                allEntries.forEach(entry => {
                    if (!uniqueEmails.has(entry.email)) {
                        uniqueEmails.set(entry.email, entry);
                    } else {
                        // If this person has multiple entries, collect all nicknames
                        const existingEntry = uniqueEmails.get(entry.email);
                        if (!existingEntry.allNicknames) {
                            existingEntry.allNicknames = [existingEntry.nickname];
                        }
                        existingEntry.allNicknames.push(entry.nickname);
                    }
                });
                
                const entries = Array.from(uniqueEmails.values());
                
                if (entries.length === 0) {
                    return res.json({ 
                        success: true, 
                        message: 'No unpaid entries found',
                        results: { successful: [], failed: [] }
                    });
                }
                
                const results = {
                    successful: [],
                    failed: []
                };
                
                // Send personalized reminder to each unpaid participant
                for (const entry of entries) {
                    const personalizedSubject = subject || 'Reminder: Payment Required for Your Scoonies Entry';
                    
                    // Default message if none provided
                    let personalizedMessage = message;
                    let htmlMessage;
                    const isMultiple = entry.allNicknames && entry.allNicknames.length > 1;

                    if (!personalizedMessage) {
                        // Build nicknameText for plain text
                        let nicknameText = entry.nickname;
                        if (isMultiple) {
                            nicknameText = `"${entry.allNicknames.join('", "')}"`;
                        } else {
                            nicknameText = `"${nicknameText}"`;
                        }

                        // Plain text version
                        personalizedMessage = `Hi ${entry.player_name},\n\n` +
                            `This is a friendly reminder that payment is required for your Scoonies ${isMultiple ? 'entries' : 'entry'} ${nicknameText}. ` +
                            `Please submit your payment as soon as possible to ensure your ${isMultiple ? 'entries are' : 'entry is'} included in the competition.\n\n` +
                            `You can pay via Venmo (@Brian-Swarts) or PayPal (paypal.me/bswarts2).\n\n` +
                            `Thank you,\nThe Scoonies Team`;

                        // Rich HTML version with payment links
                        const nicknameHtml = isMultiple
                            ? entry.allNicknames.map(n => `<strong>${n}</strong>`).join(', ')
                            : `<strong>${entry.nickname}</strong>`;

                        htmlMessage = brandedHtml('💰 Payment Reminder', `
                            <p style="color:#333;font-size:15px;line-height:1.6;">Hi <strong>${entry.player_name}</strong>,</p>
                            <p style="color:#333;font-size:15px;line-height:1.6;">
                                This is a friendly reminder that payment is required for your Scoonies
                                ${isMultiple ? 'entries' : 'entry'}: ${nicknameHtml}.
                                Please submit your payment as soon as possible to ensure your
                                ${isMultiple ? 'entries are' : 'entry is'} included in the competition.
                            </p>
                            <div style="background:#fff8e1;border-left:4px solid #f5a623;border-radius:4px;padding:16px 18px;margin:20px 0;">
                                <p style="margin:0 0 8px;font-weight:bold;color:#b07d00;font-size:15px;">💰 $20 per entry — pay Brian Swarts:</p>
                                <p style="margin:0 0 6px;font-size:15px;">
                                    <a href="https://venmo.com/Brian-Swarts" style="color:#dc3545;font-weight:bold;">Venmo: @Brian-Swarts</a>
                                </p>
                                <p style="margin:0 0 10px;font-size:15px;">
                                    <a href="https://paypal.me/bswarts2" style="color:#dc3545;font-weight:bold;">PayPal: paypal.me/bswarts2</a>
                                </p>
                                <p style="margin:8px 0 0;color:#c0392b;font-size:13px;font-weight:bold;">⚠️ Entries that have not been paid by tipoff will be deleted.</p>
                            </div>
                            <p style="color:#333;font-size:15px;line-height:1.6;">Thank you,<br>The Scoonies Team</p>
                        `);
                    } else {
                        // Replace placeholders with actual values
                        personalizedMessage = personalizedMessage
                            .replace(/\{name\}/g, entry.player_name)
                            .replace(/\{nickname\}/g, entry.nickname)
                            .replace(/\{email\}/g, entry.email);

                        // If they have multiple entries, try to add that info
                        if (isMultiple) {
                            const allNicknamesText = entry.allNicknames.join('", "');
                            personalizedMessage = personalizedMessage.replace(/\{all_nicknames\}/g, `"${allNicknamesText}"`);
                        } else {
                            personalizedMessage = personalizedMessage.replace(/\{all_nicknames\}/g, `"${entry.nickname}"`);
                        }

                        // Custom message — convert plain text to branded HTML
                        const normalizedMsg = personalizedMessage.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                        const reminderBody = `<p style="color:#333;font-size:15px;line-height:1.6;">${normalizedMsg.replace(/\n\n/g, '</p><p style="color:#333;font-size:15px;line-height:1.6;">').replace(/\n/g, '<br>')}</p>`;
                        htmlMessage = brandedHtml('💰 Payment Reminder', reminderBody);
                    }
                    
                    try {
                        const result = await emailService.sendEmail(
                            entry.email,
                            personalizedSubject,
                            personalizedMessage,
                            htmlMessage
                        );
                        
                        if (result.success) {
                            results.successful.push(entry.email);
                        } else {
                            results.failed.push({ email: entry.email, error: result.error });
                        }
                    } catch (error) {
                        results.failed.push({ email: entry.email, error: error.message });
                    }
                }
                
                res.json({
                    success: true,
                    message: `Sent payment reminders to ${results.successful.length} participants`,
                    results
                });
            }
        );
    } catch (error) {
        console.error('Error sending payment reminders:', error);
        res.status(500).json({ error: 'Error sending payment reminders: ' + error.message });
    }
});

// Preview scoring update email (returns HTML without sending)
// Uses the first entry in the DB as the sample recipient for placeholder substitution
router.get('/preview-scoring-update', requireAuth, async (req, res) => {
    const customMessage = req.query.message || "Here's how everyone stacks up. Good luck the rest of the way!";
    try {
        const entries = await new Promise((resolve, reject) => {
            db.all(`SELECT player_name, email, nickname, score FROM entries ORDER BY score DESC`,
                (err, rows) => err ? reject(err) : resolve(rows));
        });
        if (!entries.length) return res.send('<p>No entries found.</p>');
        let rank = 0, prevScore = null, sameRankCount = 0;
        const ranked = entries.map(e => {
            if (e.score !== prevScore) { rank += 1 + sameRankCount; sameRankCount = 0; }
            else { sameRankCount++; }
            prevScore = e.score;
            return { ...e, rank };
        });

        // Build sample recipient from the top-ranked entry for placeholder preview
        const sample = ranked[0];
        const sampleNicknames = ranked.filter(e => e.email === sample.email).map(e => `"${e.nickname}"`).join(', ');
        let previewMsg = customMessage;
        previewMsg = previewMsg.replace(/\{name\}/g, sample.player_name || '');
        previewMsg = previewMsg.replace(/\{nickname\}/g, sample.nickname || '');
        previewMsg = previewMsg.replace(/\{email\}/g, sample.email || '');
        previewMsg = previewMsg.replace(/\{all_nicknames\}/g, sampleNicknames || sample.nickname || '');

        const rowsHtml = ranked.map(e => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#dc3545;">${e.rank}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">${e.score}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${e.nickname}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${e.player_name}</td>
        </tr>`).join('');

        const normalizedPreviewMsg = previewMsg.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const scoringBody = `
      <p style="color:#555;margin:0 0 4px;">${normalizedPreviewMsg.replace(/\n\n/g, '</p><p style="color:#555;margin:0 0 4px;">').replace(/\n/g, '<br>')}</p>
      <p style="color:#aaa;font-size:11px;margin:0 0 20px;font-style:italic;">↑ Personalized for each recipient — previewing as: ${sample.player_name} (${sample.email})</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#dc3545;color:#fff;">
            <th style="padding:10px 12px;text-align:center;font-weight:600;">Rank</th>
            <th style="padding:10px 12px;text-align:center;font-weight:600;">Score</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;">Entry Name</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;">Submitted By</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
        res.send(brandedHtml('📊 Scoring Update', scoringBody));
    } catch (err) {
        res.status(500).send(`<p>Error: ${err.message}</p>`);
    }
});

// Send scoring update to all participants
router.post('/send-scoring-update', requireAuth, async (req, res) => {
    const customMessage = (req.body && req.body.message) || "Here's how everyone stacks up. Good luck the rest of the way!";

    try {
        // Fetch all entries ranked by score
        const entries = await new Promise((resolve, reject) => {
            db.all(
                `SELECT player_name, email, nickname, score, has_paid
                 FROM entries ORDER BY score DESC`,
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        if (entries.length === 0) {
            return res.json({ success: true, message: 'No entries found.', results: { successful: [], failed: [] } });
        }

        // Build ranked rows — ties get the same rank
        let rank = 0, prevScore = null, sameRankCount = 0;
        const ranked = entries.map((e, i) => {
            if (e.score !== prevScore) {
                rank += 1 + sameRankCount;
                sameRankCount = 0;
            } else {
                sameRankCount++;
            }
            prevScore = e.score;
            return { ...e, rank };
        });

        // Build standings table (same for everyone)
        const rowsHtml = ranked.map(e => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#dc3545;">${e.rank}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">${e.score}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${e.nickname}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${e.player_name}</td>
        </tr>`).join('');

        const tableHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#dc3545;color:#fff;">
            <th style="padding:10px 12px;text-align:center;font-weight:600;">Rank</th>
            <th style="padding:10px 12px;text-align:center;font-weight:600;">Score</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;">Entry Name</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;">Submitted By</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;

        const textRows = ranked.map(e =>
            `  ${String(e.rank).padStart(3)}. [${e.score} pts]  ${e.nickname}  — ${e.player_name}`
        ).join('\n');

        const subject = '🏀 Scoonies Scoring Update';

        // Group entries by email so {all_nicknames} works for multi-entry people
        const byEmail = new Map();
        ranked.forEach(e => {
            if (!byEmail.has(e.email)) {
                byEmail.set(e.email, { name: e.player_name, email: e.email, nickname: e.nickname, _nicknames: [], rank: e.rank, score: e.score });
            }
            byEmail.get(e.email)._nicknames.push(e.nickname);
        });
        byEmail.forEach(d => {
            d.all_nicknames = d._nicknames.map(n => `"${n}"`).join(', ');
        });

        const results = { successful: [], failed: [] };
        for (const recipient of byEmail.values()) {
            // Personalize the message for this recipient
            let personalizedMsg = customMessage;
            ['name', 'nickname', 'email', 'all_nicknames'].forEach(key => {
                personalizedMsg = personalizedMsg.replace(new RegExp(`\\{${key}\\}`, 'g'), recipient[key] || '');
            });

            const normalizedMsg = personalizedMsg.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const scoringBody = `
      <p style="color:#555;margin:0 0 24px;">${normalizedMsg.replace(/\n\n/g, '</p><p style="color:#555;margin:0 0 24px;">').replace(/\n/g, '<br>')}</p>${tableHtml}`;
            const html = brandedHtml('📊 Scoring Update', scoringBody);
            const text = `THE SCOONIES — SCORING UPDATE\n${'─'.repeat(50)}\n\n${personalizedMsg}\n\n${textRows}\n\n${'─'.repeat(50)}\n— The Scoonies`;

            const result = await emailService.sendEmail(recipient.email, subject, text, html);
            if (result.success) results.successful.push(recipient.email);
            else results.failed.push({ email: recipient.email, error: result.error });
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error sending scoring update:', error);
        res.status(500).json({ error: 'Error sending scoring update: ' + error.message });
    }
});

// Sync unique players from game.db into players.db
router.post('/sync-players', requireAuth, (req, res) => {
    db.all(
        `SELECT
             player_name,
             LOWER(email) AS email,
             MIN(submission_date) AS first_seen,
             MAX(submission_date) AS last_seen
         FROM entries
         GROUP BY LOWER(email)
         ORDER BY player_name`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Error reading entries: ' + err.message });
            if (rows.length === 0) return res.json({ success: true, synced: 0, message: 'No entries found in game.db.' });

            let done = 0, synced = 0, errors = 0;

            rows.forEach(row => {
                playersDb.run(
                    `INSERT INTO players (player_name, email, first_seen, last_seen)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(email) DO UPDATE SET
                         player_name = excluded.player_name,
                         last_seen   = MAX(last_seen, excluded.last_seen)`,
                    [row.player_name, row.email, row.first_seen, row.last_seen],
                    function(err) {
                        if (err) errors++;
                        else synced++;
                        done++;
                        if (done === rows.length) {
                            console.log(`sync-players: ${synced} synced, ${errors} errors`);
                            res.json({ success: true, synced, errors, total: rows.length });
                        }
                    }
                );
            });
        }
    );
});

// Get all past players from the persistent players.db
router.get('/past-players', requireAuth, (req, res) => {
    playersDb.all(
        `SELECT id, player_name, email, first_seen, last_seen FROM players ORDER BY player_name`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
            res.json({ players: rows });
        }
    );
});

// Send a season-invite email to selected past players
router.post('/send-invite', requireAuth, async (req, res) => {
    const { recipients, subject, message } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Recipients are required' });
    }
    if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
    }

    // Fetch player details for placeholder substitution
    const playerMap = await new Promise((resolve, reject) => {
        playersDb.all(
            `SELECT player_name, email FROM players WHERE email IN (${recipients.map(() => '?').join(',')})`,
            recipients,
            (err, rows) => {
                if (err) return reject(err);
                const map = {};
                rows.forEach(r => { map[r.email.toLowerCase()] = r; });
                resolve(map);
            }
        );
    }).catch(err => { res.status(500).json({ error: err.message }); return null; });

    if (!playerMap) return;

    const results = { successful: [], failed: [] };

    for (const email of recipients) {
        const player = playerMap[email.toLowerCase()] || { player_name: '', email };
        let personalizedMessage = message
            .replace(/\{name\}/g, player.player_name)
            .replace(/\{email\}/g, player.email);

        const normalized = personalizedMessage.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const bodyHtml = `<p style="color:#333;font-size:15px;line-height:1.6;">${normalized.replace(/\n\n/g, '</p><p style="color:#333;font-size:15px;line-height:1.6;">').replace(/\n/g, '<br>')}</p>`;
        const html = brandedHtml(subject, bodyHtml);

        try {
            const result = await emailService.sendEmail(email, subject, normalized, html);
            if (result.success) results.successful.push(email);
            else results.failed.push({ email, error: result.error });
        } catch (err) {
            results.failed.push({ email, error: err.message });
        }
    }

    res.json({ success: true, results });
});

module.exports = router;