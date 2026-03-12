// routes/communications.js
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const emailService = require('../services/email-service');

function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Get all entries with email addresses, but only unique addresses, no dupes.
router.get('/recipients', requireAuth, (req, res) => {
    db.all(
        `SELECT id, player_name, email, nickname, has_paid FROM entries ORDER BY player_name`,
        (err, entries) => {
            if (err) {
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            
            // Create a map to store unique email addresses
            const uniqueEmails = new Map();
            
            // For each entry, keep only the first occurrence of each email
            entries.forEach(entry => {
                if (!uniqueEmails.has(entry.email)) {
                    uniqueEmails.set(entry.email, entry);
                }
            });
            
            // Convert map values back to array
            const uniqueEntries = Array.from(uniqueEmails.values());
            
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
        
        // Get participant details for personalization
        const participantDetails = await new Promise((resolve, reject) => {
            const placeholders = ['name', 'nickname', 'email'];
            // Only fetch details if message contains placeholders
            if (placeholders.some(p => message.includes(`{${p}}`))) {
                db.all(
                    `SELECT id, player_name, email, nickname FROM entries WHERE email IN (${recipients.map(() => '?').join(',')})`,
                    recipients,
                    (err, rows) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        // Create a map of email to participant details
                        const detailsMap = {};
                        rows.forEach(row => {
                            detailsMap[row.email] = {
                                name: row.player_name,
                                nickname: row.nickname,
                                email: row.email
                            };
                        });
                        
                        resolve(detailsMap);
                    }
                );
            } else {
                // No placeholders to replace, return empty map
                resolve({});
            }
        });
        
        // Send to each recipient with personalized message
        for (const recipient of recipients) {
            try {
                // Get participant details if available
                const details = participantDetails[recipient] || {
                    name: '',
                    nickname: '',
                    email: recipient
                };
                
                // Replace placeholders
                let personalizedMessage = message;
                for (const [key, value] of Object.entries(details)) {
                    personalizedMessage = personalizedMessage.replace(
                        new RegExp(`\\{${key}\\}`, 'g'), 
                        value || ''
                    );
                }
                
                // For HTML emails, wrap the message in basic HTML formatting
                const htmlMessage = messageType === 'html' 
                    ? personalizedMessage 
                    : `<p>${personalizedMessage.replace(/\n/g, '</p><p>')}</p>`;
                
                const result = await emailService.sendEmail(
                    recipient,
                    subject,
                    personalizedMessage, // Plain text version
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
        
        // Get all participants
        const allParticipants = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
        
        // De-duplicate by email address
        const uniqueParticipants = new Map();
        allParticipants.forEach(participant => {
            if (!uniqueParticipants.has(participant.email)) {
                uniqueParticipants.set(participant.email, participant);
            }
        });
        
        const participants = Array.from(uniqueParticipants.values());
        
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
                personalizedMessage = personalizedMessage.replace(/\{name\}/g, participant.player_name || '');
                personalizedMessage = personalizedMessage.replace(/\{nickname\}/g, participant.nickname || '');
                personalizedMessage = personalizedMessage.replace(/\{email\}/g, participant.email || '');
                
                // For HTML emails, wrap the message in basic HTML formatting
                const htmlMessage = messageType === 'html' 
                    ? personalizedMessage 
                    : `<p>${personalizedMessage.replace(/\n/g, '</p><p>')}</p>`;
                
                const result = await emailService.sendEmail(
                    participant.email,
                    subject,
                    personalizedMessage, // Plain text version
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
                    if (!personalizedMessage) {
                        // If they have multiple entries, list them all
                        let nicknameText = entry.nickname;
                        if (entry.allNicknames && entry.allNicknames.length > 1) {
                            nicknameText = entry.allNicknames.join('", "');
                            nicknameText = `"${nicknameText}"`;
                        } else {
                            nicknameText = `"${nicknameText}"`;
                        }
                        
                        personalizedMessage = `Hi ${entry.player_name},\n\n` +
                            `This is a friendly reminder that payment is required for your Scoonies ${entry.allNicknames && entry.allNicknames.length > 1 ? 'entries' : 'entry'} ${nicknameText}. ` +
                            `Please submit your payment as soon as possible to ensure your ${entry.allNicknames && entry.allNicknames.length > 1 ? 'entries are' : 'entry is'} included in the competition.\n\n` +
                            `You can pay via Venmo (@Brian-Swarts) or PayPal.\n\n` +
                            `Thank you,\nThe Scoonies Team`;
                    } else {
                        // Replace placeholders with actual values
                        personalizedMessage = personalizedMessage
                            .replace(/\{name\}/g, entry.player_name)
                            .replace(/\{nickname\}/g, entry.nickname)
                            .replace(/\{email\}/g, entry.email);
                            
                        // If they have multiple entries, try to add that info
                        if (entry.allNicknames && entry.allNicknames.length > 1) {
                            const allNicknamesText = entry.allNicknames.join('", "');
                            personalizedMessage = personalizedMessage.replace(/\{all_nicknames\}/g, `"${allNicknamesText}"`);
                        } else {
                            personalizedMessage = personalizedMessage.replace(/\{all_nicknames\}/g, `"${entry.nickname}"`);
                        }
                    }
                    
                    // HTML version with basic formatting
                    const htmlMessage = `<p>${personalizedMessage.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
                    
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

// Send scoring update to all participants
router.post('/send-scoring-update', requireAuth, async (req, res) => {
    const SITE_URL = (process.env.SITE_URL || 'https://scoonies.com').replace(/\/$/, '');

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

        // Build standings table rows (HTML)
        const rowsHtml = ranked.map(e => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#dc3545;">${e.rank}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">${e.score}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${e.nickname}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${e.player_name}</td>
        </tr>`).join('');

        // Plain text version
        const textRows = ranked.map(e =>
            `  ${String(e.rank).padStart(3)}. [${e.score} pts]  ${e.nickname}  — ${e.player_name}`
        ).join('\n');

        const scooniesLogoSrc = `${SITE_URL}/images/Scoonies.jpg`;

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:#fff;padding:24px 32px;text-align:center;border-bottom:3px solid #dc3545;">
      <img src="${scooniesLogoSrc}" alt="The Scoonies" style="max-height:80px;max-width:280px;object-fit:contain;">
      <p style="margin:10px 0 0;color:#999;font-size:14px;">2026 Tournament Challenge</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <h2 style="color:#dc3545;margin:0 0 6px;">📊 Scoring Update</h2>
      <p style="color:#555;margin:0 0 24px;">Here's how everyone stacks up. Good luck the rest of the way!</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#dc3545;color:#fff;">
            <th style="padding:10px 12px;text-align:center;font-weight:600;">Rank</th>
            <th style="padding:10px 12px;text-align:center;font-weight:600;">Score</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;">Entry Name</th>
            <th style="padding:10px 12px;text-align:left;font-weight:600;">Submitted By</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#f4f4f4;padding:18px 32px;text-align:center;border-top:1px solid #ddd;">
      <p style="margin:0;font-size:13px;color:#999;">The Scoonies &nbsp;|&nbsp; <a href="mailto:thescoonies.basketball@gmail.com" style="color:#dc3545;">thescoonies.basketball@gmail.com</a></p>
    </div>

  </div>
</body>
</html>`;

        const text = `THE SCOONIES — SCORING UPDATE\n${'─'.repeat(50)}\n\n${textRows}\n\n${'─'.repeat(50)}\nGood luck!\n— The Scoonies`;
        const subject = '🏀 Scoonies Scoring Update';

        // Get unique emails
        const uniqueEmails = new Map();
        entries.forEach(e => { if (!uniqueEmails.has(e.email)) uniqueEmails.set(e.email, e); });
        const recipients = Array.from(uniqueEmails.values());

        const results = { successful: [], failed: [] };
        for (const recipient of recipients) {
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

module.exports = router;