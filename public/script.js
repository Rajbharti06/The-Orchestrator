const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const recoverForm = document.getElementById('recover-form');
const resetForm = document.getElementById('reset-form');

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json();
    console.log(data);
  } catch (err) {
    console.error(err);
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    console.log(data);
  } catch (err) {
    console.error(err);
  }
});

recoverForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  try {
    const response = await fetch('/api/recover-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    console.log(data);
  } catch (err) {
    console.error(err);
  }
});

resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('token').value;
  const password = document.getElementById('password').value;
  try {
    const response = await fetch('/api/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, password })
    });
    const data = await response.json();
    console.log(data);
  } catch (err) {
    console.error(err);
  }
});