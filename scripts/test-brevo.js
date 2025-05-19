// test-brevo.js
require('dotenv').config();
const { sendEmail } = require('./services/email-service');

async function testBrevo() {
    try {
        console.log('Testing Brevo email with API key:', process.env.BREVO_API_KEY?.substring(0, 5) + '...');
        
        const result = await sendEmail(
            'thescoonies.basketball@gmail.com',  // Replace with test email
            'Test from Scoonies App',
            'This is a test email from Brevo integration',
            '<h1>Brevo Test</h1><p>This is an HTML test from the Scoonies app.</p>'
        );
        
        console.log('Brevo result:', result);
    } catch (error) {
        console.error('Error in Brevo test:', error);
    }
}

testBrevo();