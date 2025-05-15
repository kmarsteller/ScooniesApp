// routes/communications.js
const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const emailService = require('../services/email-service');

// Get all entries with email addresses, but only unique addresses, no dupes.
router.get('/recipients', (req, res) => {
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
router.post('/send', async (req, res) => {
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
router.post('/send-all', async (req, res) => {
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
router.post('/send-payment-reminders', async (req, res) => {
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

module.exports = router;