// routes/email.js
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { db } = require('../db/database');

// Email configuration
// You should move these to environment variables in a production app
const EMAIL_USER = 'your-gmail-address@gmail.com';
const EMAIL_PASS = 'your-app-password'; // Use app passwords for Gmail

// Create email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// Get email recipients
router.get('/email-recipients', (req, res) => {
    const filter = req.query.filter || 'all';
    
    let query = `
        SELECT DISTINCT email, player_name 
        FROM entries
    `;
    
    // Apply filters
    if (filter === 'paid') {
        query += ' WHERE has_paid = 1';
    } else if (filter === 'unpaid') {
        query += ' WHERE has_paid = 0 OR has_paid IS NULL';
    }
    
    db.all(query, (err, rows) => {
        if (err) {
            console.error('Error fetching email recipients:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        res.json({ recipients: rows });
    });
});

// Send email
router.post('/send-email', (req, res) => {
    const { filter, subject, body } = req.body;
    
    if (!subject || !body) {
        return res.status(400).json({ error: 'Subject and body are required' });
    }
    
    // Get recipients based on filter
    let query = `
        SELECT DISTINCT email, player_name 
        FROM entries
    `;
    
    // Apply filters
    if (filter === 'paid') {
        query += ' WHERE has_paid = 1';
    } else if (filter === 'unpaid') {
        query += ' WHERE has_paid = 0 OR has_paid IS NULL';
    }
    
    db.all(query, (err, recipients) => {
        if (err) {
            console.error('Error fetching email recipients:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        if (!recipients.length) {
            return res.status(400).json({ error: 'No recipients match the selected criteria' });
        }
        
        // Create an array of promises for each email
        const emailPromises = recipients.map(recipient => {
            return new Promise((resolve, reject) => {
                // Personalize the email by replacing placeholders
                const personalizedBody = body
                    .replace(/\{name\}/g, recipient.player_name || 'Participant')
                    .replace(/\{email\}/g, recipient.email);
                
                const mailOptions = {
                    from: `"The Scoonies" <${EMAIL_USER}>`,
                    to: recipient.email,
                    subject: subject,
                    text: personalizedBody
                };
                
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error(`Error sending email to ${recipient.email}:`, error);
                        reject(error);
                    } else {
                        console.log(`Email sent to ${recipient.email}:`, info.response);
                        resolve(info);
                    }
                });
            });
        });
        
        // Execute all email sends
        Promise.allSettled(emailPromises)
            .then(results => {
                const succeeded = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.filter(r => r.status === 'rejected').length;
                
                if (failed === 0) {
                    res.json({ 
                        success: true, 
                        message: `Successfully sent emails to all ${succeeded} recipients!` 
                    });
                } else {
                    res.json({ 
                        partialSuccess: true, 
                        message: `Sent ${succeeded} emails successfully, but failed to send ${failed} emails.` 
                    });
                }
            })
            .catch(error => {
                console.error('Error sending emails:', error);
                res.status(500).json({ error: 'Error sending emails: ' + error.message });
            });
    });
});

module.exports = router;