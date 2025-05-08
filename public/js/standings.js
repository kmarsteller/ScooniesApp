document.addEventListener('DOMContentLoaded', function() {
    // Fetch standings data from the server
    fetchStandings();
    
    // Refresh standings every 60 seconds
    setInterval(fetchStandings, 60000);
});

function fetchStandings() {
    fetch('/api/standings')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            updateStandingsTable(data.standings);
            document.getElementById('updateTime').textContent = new Date().toLocaleString();
        })
        .catch(error => {
            console.error('Error fetching standings:', error);
            document.getElementById('standingsBody').innerHTML = 
                `<tr><td colspan="3">Error loading standings. Please try again later.</td></tr>`;
        });
}

function updateStandingsTable(standings) {
    const tableBody = document.getElementById('standingsBody');
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (standings.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3">No entries yet</td></tr>';
        return;
    }
    
    // Add standings to table
    standings.forEach((entry, index) => {
        const row = document.createElement('tr');
        
        // Add rank
        const rankCell = document.createElement('td');
        rankCell.textContent = index + 1;
        row.appendChild(rankCell);
        
        // Add player name
        const nameCell = document.createElement('td');
        nameCell.textContent = entry.player_name;
        row.appendChild(nameCell);
        
        // Add score
        const scoreCell = document.createElement('td');
        scoreCell.textContent = entry.score;
        row.appendChild(scoreCell);
        
        // Add row to table
        tableBody.appendChild(row);
    });
}
