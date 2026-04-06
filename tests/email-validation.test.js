// tests/email-validation.test.js
// Tests for the email format validation regex used in both:
//   • public/submit.html  (client-side)
//   • routes/entries.js   (server-side)
//
// Both use the same pattern: /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function isValid(email) {
    return emailRegex.test(email);
}

// ── Valid addresses ────────────────────────────────────────────────────────────

describe('Valid email addresses', () => {
    const valid = [
        'user@example.com',
        'user@example.org',
        'user@example.co.uk',
        'user.name@example.com',
        'user+tag@example.com',
        'user123@domain.net',
        'a@b.io',
        'very.long.email.address@subdomain.example.com',
        'user@domain.photography',
        'USER@EXAMPLE.COM',
    ];

    valid.forEach(email => {
        test(`accepts: ${email}`, () => expect(isValid(email)).toBe(true));
    });
});

// ── Invalid addresses ──────────────────────────────────────────────────────────

describe('Invalid email addresses', () => {
    const invalid = [
        '',
        'notanemail',
        '@nodomain.com',
        'missingatsign.com',
        'user@',
        'user@domain',           // no TLD
        'user@domain.c',         // TLD too short (< 2 chars)
        'user @example.com',     // space before @
        'user@ example.com',     // space after @
        'user@exam ple.com',     // space in domain
        'user@@example.com',     // double @
    ];

    invalid.forEach(email => {
        test(`rejects: "${email}"`, () => expect(isValid(email)).toBe(false));
    });
});

// ── Edge cases ─────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
    test('two-character TLD is valid', () => expect(isValid('user@example.uk')).toBe(true));
    test('three-character TLD is valid', () => expect(isValid('user@example.com')).toBe(true));
    test('single-character TLD is invalid', () => expect(isValid('user@example.c')).toBe(false));
    test('numeric domain is valid', () => expect(isValid('user@123.com')).toBe(true));
    test('hyphenated domain is valid', () => expect(isValid('user@my-domain.com')).toBe(true));
});
