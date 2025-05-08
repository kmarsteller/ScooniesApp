document.addEventListener('DOMContentLoaded', function() {
    const entryForm = document.getElementById('entryForm');
    const messageDiv = document.getElementById('message');
    
    entryForm.addEventListener('submit', function(event) {
        event.preventDefault();
        
        // Get form data
        const formData = {
            playerName: document.getElementById('playerName').value,
            email: document.getElementById('email').value,
            prediction: document.getElementById('prediction').value
        };
        
        // Submit entry to server
        fetch('/api/entries', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Show success message
            messageDiv.textContent = data.message || 'Entry submitted successfully!';
            messageDiv.className = 'success';
            
            // Reset form
            entryForm.reset();
        })
        .catch(error => {
            console.error('Error submitting entry:', error);
            messageDiv.textContent = 'Error submitting entry. Please try again.';
            messageDiv.className = 'error';
        });
    });
});
