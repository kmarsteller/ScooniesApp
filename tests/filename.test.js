// tests/filename.test.js
// Tests for logo filename generation.
// Verifies that team names are converted identically by all three consumers:
//   utils/filename.js  →  used by entries.js, tournament.html, download-logos.js

const { teamLogoFilename } = require('../utils/filename');

describe('Standard team names', () => {
    test('simple name', () => {
        expect(teamLogoFilename('Duke')).toBe('duke');
    });
    test('two-word name', () => {
        expect(teamLogoFilename('Iowa State')).toBe('iowa-state');
    });
    test('three-word name', () => {
        expect(teamLogoFilename('Michigan State')).toBe('michigan-state');
    });
    test('all-caps abbreviation', () => {
        expect(teamLogoFilename('VCU')).toBe('vcu');
    });
    test('hyphenated acronym', () => {
        expect(teamLogoFilename('SIU Edwardsville')).toBe('siu-edwardsville');
    });
});

describe('Ampersand handling', () => {
    test('Texas A&M becomes texas-a-m (& treated as space)', () => {
        expect(teamLogoFilename('Texas A&M')).toBe('texas-a-m');
    });
    test('no double-hyphen around ampersand', () => {
        const result = teamLogoFilename('Texas A&M');
        expect(result).not.toContain('--');
    });
});

describe('Apostrophe handling', () => {
    test("straight apostrophe in Saint Mary's", () => {
        expect(teamLogoFilename("Saint Mary's")).toBe('saint-mary-s');
    });
    test("curly apostrophe in Saint Mary\u2019s", () => {
        expect(teamLogoFilename('Saint Mary\u2019s')).toBe('saint-mary-s');
    });
    test("Mount St. Mary's", () => {
        expect(teamLogoFilename("Mount St. Mary's")).toBe('mount-st.-mary-s');
    });
});

describe("Period handling (St. / Mt.)", () => {
    test("St. John's keeps the period in st.", () => {
        expect(teamLogoFilename("St. John's")).toBe('st.-john-s');
    });
    test('no leading or trailing hyphens', () => {
        const result = teamLogoFilename("St. John's");
        expect(result).not.toMatch(/^-|-$/);
    });
});

describe('No double hyphens in any real 2025 bracket team name', () => {
    const teams2025 = [
        'Auburn', 'Michigan State', 'Iowa State', 'Texas A&M', 'Michigan',
        'Ole Miss', 'Marquette', 'Louisville', 'Creighton', 'New Mexico',
        'North Carolina', 'UC San Diego', 'Yale', 'Lipscomb', 'Bryant',
        'Alabama State', 'Florida', "St. John's", 'Texas Tech', 'Maryland',
        'Memphis', 'Missouri', 'Kansas', 'UConn', 'Oklahoma', 'Arkansas',
        'Drake', 'Colorado State', 'Grand Canyon', 'UNC Wilmington', 'Omaha',
        'Norfolk State', 'Duke', 'Alabama', 'Wisconsin', 'Arizona', 'Oregon',
        'BYU', "Saint Mary's", 'Mississippi State', 'Baylor', 'Vanderbilt',
        'VCU', 'Liberty', 'Akron', 'Montana', 'Robert Morris',
        "Mount St. Mary's", 'Houston', 'Tennessee', 'Kentucky', 'Purdue',
        'Clemson', 'Illinois', 'UCLA', 'Gonzaga', 'Georgia', 'Utah State',
        'Xavier', 'McNeese', 'High Point', 'Troy', 'Wofford', 'SIU Edwardsville',
    ];

    teams2025.forEach(name => {
        test(`"${name}" has no double-hyphens`, () => {
            expect(teamLogoFilename(name)).not.toContain('--');
        });
    });
});
