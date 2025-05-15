// services/email-service.js
const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Test email configuration on startup
async function verifyConnection() {
    try {
        await transporter.verify();
        console.log('Email service is ready to send messages');
        return true;
    } catch (error) {
        console.error('Error verifying email configuration:', error);
        return false;
    }
}

// Send email to a single recipient
async function sendEmail(to, subject, text, html) {
    try {
        const mailOptions = {
            from: `"Scoonies Tournament" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// Send bulk emails
async function sendBulkEmails(recipients, subject, text, html) {
    const results = {
        successful: [],
        failed: []
    };

    for (const recipient of recipients) {
        try {
            const result = await sendEmail(recipient, subject, text, html);
            if (result.success) {
                results.successful.push(recipient);
            } else {
                results.failed.push({ email: recipient, error: result.error });
            }
        } catch (error) {
            results.failed.push({ email: recipient, error: error.message });
        }
    }

    return results;
}

module.exports = {
    verifyConnection,
    sendEmail,
    sendBulkEmails
};