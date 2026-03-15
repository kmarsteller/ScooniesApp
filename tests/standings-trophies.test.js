// tests/standings-trophies.test.js
// Tests for the trophy-emoji logic on the standings page.
// Mirrors the JS in public/standings.html exactly.

const TROPHIES = ['🥇', '🥈', '🥉'];

function getRankText(index, tournamentStatus) {
    const isTournamentComplete = tournamentStatus && tournamentStatus.currentRound === null;
    const trophy = isTournamentComplete && index < 3 ? TROPHIES[index] + ' ' : '';
    return `${trophy}#${index + 1}`;
}

describe('Trophy display when tournament is complete', () => {
    const complete = { currentRound: null, gamesCompleted: 63, totalGames: 63, roundName: 'Complete' };

    test('1st place gets gold trophy', () => {
        expect(getRankText(0, complete)).toBe('🥇 #1');
    });

    test('2nd place gets silver trophy', () => {
        expect(getRankText(1, complete)).toBe('🥈 #2');
    });

    test('3rd place gets bronze trophy', () => {
        expect(getRankText(2, complete)).toBe('🥉 #3');
    });

    test('4th place gets no trophy', () => {
        expect(getRankText(3, complete)).toBe('#4');
    });

    test('last place (64th) gets no trophy', () => {
        expect(getRankText(63, complete)).toBe('#64');
    });
});

describe('No trophies when tournament is in progress', () => {
    const inProgress = { currentRound: 3, gamesCompleted: 4, totalGames: 8, roundName: 'Sweet 16' };

    test('1st place has no trophy during tournament', () => {
        expect(getRankText(0, inProgress)).toBe('#1');
    });

    test('2nd place has no trophy during tournament', () => {
        expect(getRankText(1, inProgress)).toBe('#2');
    });
});

describe('No trophies before tournament starts', () => {
    const notStarted = { currentRound: 1, gamesCompleted: 0, totalGames: 32, roundName: 'Round of 64' };

    test('1st place has no trophy before start', () => {
        expect(getRankText(0, notStarted)).toBe('#1');
    });
});

describe('No trophies when tournamentStatus is missing', () => {
    test('null status → no trophy', () => {
        expect(getRankText(0, null)).toBe('#1');
    });

    test('undefined status → no trophy', () => {
        expect(getRankText(0, undefined)).toBe('#1');
    });
});
