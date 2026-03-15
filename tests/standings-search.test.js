// tests/standings-search.test.js
// Tests for the standings search/filter logic.
// Mirrors the filtering logic in public/standings.html.

function buildSearchIndex(entry) {
    return `${entry.player_name} ${entry.nickname} ${entry.email}`.toLowerCase();
}

function applySearch(entries, query) {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => buildSearchIndex(e).includes(q));
}

function applyUnpaidFilter(entries, unpaidOnly) {
    if (!unpaidOnly) return entries;
    return entries.filter(e => !e.has_paid);
}

function applyFilters(entries, query, unpaidOnly) {
    return applyUnpaidFilter(applySearch(entries, query), unpaidOnly);
}

const ENTRIES = [
    { player_name: 'Alice Smith',   nickname: 'AliceWins',  email: 'alice@example.com',  has_paid: true  },
    { player_name: 'Bob Jones',     nickname: 'BobbyBall',  email: 'bob@example.com',    has_paid: false },
    { player_name: 'Carol Davis',   nickname: 'CDee',       email: 'carol@work.org',     has_paid: true  },
    { player_name: 'Dave Thompson', nickname: 'DeeGee',     email: 'dave@example.com',   has_paid: false },
];

describe('applySearch — text matching', () => {
    test('empty query returns all entries', () => {
        expect(applySearch(ENTRIES, '')).toHaveLength(4);
    });

    test('matches by player_name (case-insensitive)', () => {
        const results = applySearch(ENTRIES, 'alice');
        expect(results).toHaveLength(1);
        expect(results[0].player_name).toBe('Alice Smith');
    });

    test('matches by nickname', () => {
        const results = applySearch(ENTRIES, 'bobbybAll');
        expect(results).toHaveLength(1);
        expect(results[0].nickname).toBe('BobbyBall');
    });

    test('matches by email', () => {
        const results = applySearch(ENTRIES, 'carol@work');
        expect(results).toHaveLength(1);
        expect(results[0].email).toBe('carol@work.org');
    });

    test('partial match works', () => {
        // "dee" matches CDee nickname and DeeGee nickname
        const results = applySearch(ENTRIES, 'dee');
        expect(results).toHaveLength(2);
    });

    test('domain match returns multiple entries', () => {
        // three entries share @example.com
        const results = applySearch(ENTRIES, 'example.com');
        expect(results).toHaveLength(3);
    });

    test('no match returns empty array', () => {
        expect(applySearch(ENTRIES, 'zzznomatch')).toHaveLength(0);
    });

    test('whitespace-only query returns all entries', () => {
        expect(applySearch(ENTRIES, '   ')).toHaveLength(4);
    });
});

describe('applyUnpaidFilter', () => {
    test('unpaidOnly=false returns all entries', () => {
        expect(applyUnpaidFilter(ENTRIES, false)).toHaveLength(4);
    });

    test('unpaidOnly=true returns only unpaid entries', () => {
        const results = applyUnpaidFilter(ENTRIES, true);
        expect(results).toHaveLength(2);
        expect(results.every(e => !e.has_paid)).toBe(true);
    });
});

describe('combined filters', () => {
    test('search + unpaid filter together', () => {
        // "example.com" matches Alice, Bob, Dave — then unpaid keeps Bob and Dave
        const results = applyFilters(ENTRIES, 'example.com', true);
        expect(results).toHaveLength(2);
        expect(results.map(e => e.player_name).sort()).toEqual(['Bob Jones', 'Dave Thompson']);
    });

    test('search with no matches + unpaid filter returns empty', () => {
        expect(applyFilters(ENTRIES, 'zzz', true)).toHaveLength(0);
    });

    test('no filters returns all', () => {
        expect(applyFilters(ENTRIES, '', false)).toHaveLength(4);
    });
});
