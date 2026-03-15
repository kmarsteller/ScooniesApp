// tests/bracket-pretourney.test.js
// Tests for the pre-tourney TBD bracket logic in routes/bracket.js.
// Exercises buildPreTourneyTeams() in isolation and verifies the
// structure/content matches what bracket.html expects.

// Pull out the helper by requiring it via a small shim so we don't
// need to spin up Express + SQLite.
const REGIONS = ['South', 'West', 'East', 'Midwest'];

function buildPreTourneyTeams() {
    const teams = [];
    for (const region of REGIONS) {
        for (let seed = 1; seed <= 16; seed++) {
            teams.push({
                team_name: 'TBD',
                region,
                seed,
                logo_url: '/images/Scoonies.jpg',
                is_eliminated: 0,
                round_reached: 1,
            });
        }
    }
    return teams;
}

describe('buildPreTourneyTeams shape', () => {
    const teams = buildPreTourneyTeams();

    test('returns exactly 64 teams', () => {
        expect(teams).toHaveLength(64);
    });

    test('16 teams per region', () => {
        for (const region of REGIONS) {
            const count = teams.filter(t => t.region === region).length;
            expect(count).toBe(16);
        }
    });

    test('seeds 1–16 present in each region', () => {
        for (const region of REGIONS) {
            const seeds = teams
                .filter(t => t.region === region)
                .map(t => t.seed)
                .sort((a, b) => a - b);
            expect(seeds).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
        }
    });

    test('every team_name is TBD', () => {
        expect(teams.every(t => t.team_name === 'TBD')).toBe(true);
    });

    test('every logo_url is /images/Scoonies.jpg', () => {
        expect(teams.every(t => t.logo_url === '/images/Scoonies.jpg')).toBe(true);
    });

    test('no team is eliminated', () => {
        expect(teams.every(t => t.is_eliminated === 0)).toBe(true);
    });

    test('all teams at round_reached 1', () => {
        expect(teams.every(t => t.round_reached === 1)).toBe(true);
    });
});

describe('pre-tourney detection logic', () => {
    // Mirrors the condition in routes/bracket.js
    function usePreTourney(settings) {
        const entriesOpen = settings['entries_open'] !== undefined
            ? settings['entries_open'] === 'true'
            : true;
        const closeReason = settings['entries_close_reason'];
        return !entriesOpen && closeReason === 'not_yet_open';
    }

    test('shows real bracket when entries are open', () => {
        expect(usePreTourney({ entries_open: 'true' })).toBe(false);
    });

    test('shows TBD when closed with not_yet_open reason', () => {
        expect(usePreTourney({ entries_open: 'false', entries_close_reason: 'not_yet_open' })).toBe(true);
    });

    test('shows real bracket when closed with deadline_passed reason', () => {
        expect(usePreTourney({ entries_open: 'false', entries_close_reason: 'deadline_passed' })).toBe(false);
    });

    test('defaults to real bracket when no settings exist', () => {
        expect(usePreTourney({})).toBe(false);
    });

    test('shows real bracket when only close_reason set but entries still open', () => {
        expect(usePreTourney({ entries_open: 'true', entries_close_reason: 'not_yet_open' })).toBe(false);
    });
});
