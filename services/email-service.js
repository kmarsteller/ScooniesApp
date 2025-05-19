// email-service.js
const SibApiV3Sdk = require('sib-api-v3-sdk');
require('dotenv').config();

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

async function sendEmail(to, subject, text, html) {
    try {
        const sender = {
            email: process.env.FROM_EMAIL || 'your-email@example.com',
            name: 'Scoonies Tournament'
        };
        
        const emailParams = {
            sender,
            to: [{ email: to }],
            subject,
            textContent: text,
            htmlContent: html
        };
        
        const data = await apiInstance.sendTransacEmail(emailParams);
        console.log(`Email sent to: ${to}`);
        return { success: true, messageId: data.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

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
    sendEmail,
    sendBulkEmails
};