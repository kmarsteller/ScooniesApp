// email-service.js — sends transactional email via Brevo (sib-api-v3-sdk)
const SibApiV3Sdk = require('sib-api-v3-sdk');
require('dotenv').config();

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const FROM_EMAIL = process.env.FROM_EMAIL || 'thescoonies.basketball@gmail.com';
const REPLY_TO   = process.env.REPLY_TO   || FROM_EMAIL;

async function sendEmail(to, subject, text, html) {
    try {
        const email = new SibApiV3Sdk.SendSmtpEmail();
        email.sender      = { email: FROM_EMAIL, name: 'The Scoonies' };
        email.replyTo     = { email: REPLY_TO };
        email.to          = [{ email: to }];
        email.subject     = subject;
        email.textContent = text;
        email.htmlContent = html;

        const data = await apiInstance.sendTransacEmail(email);
        console.log(`Email sent to: ${to}`);
        return { success: true, messageId: data.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

async function sendBulkEmails(recipients, subject, text, html) {
    const results = { successful: [], failed: [] };
    for (const recipient of recipients) {
        const result = await sendEmail(recipient, subject, text, html);
        if (result.success) {
            results.successful.push(recipient);
        } else {
            results.failed.push({ email: recipient, error: result.error });
        }
    }
    return results;
}

module.exports = { sendEmail, sendBulkEmails };
