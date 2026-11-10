document.getElementById('signupform').addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (!username) return alert('Please enter your user name');
      if (!email || !/^[^\s@]+@gmail\.com$/i.test(email)) return alert('Please enter a valid Gmail address (e.g., name@gmail.com)');
      if (!password || password.length < 4) return alert('Please enter a valid password (min 4 chars)');
      if (password !== confirmPassword) return alert('Passwords do not match');

      try {
        const apiUrl = window.location.origin + '/api/signup';

        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });


        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          if (resp.status === 409) {
            alert('account already exist 🙃');
          } else {
            alert(data && data.message ? data.message : 'Signup failed');
          }
          return;
        }
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loginEmail', email);
        localStorage.setItem('loginUsername', username);
        localStorage.setItem('loginPassword', password);

        alert('Account created successfully!');
        window.location.href = './index.html';
      } catch (err) {
        console.error(err);
        alert('Cannot reach signup server. Make sure you run `node server.js` and open the page via http://localhost (not file://).');
      }

    });
