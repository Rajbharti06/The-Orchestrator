import React, { useState } from 'react';
import axios from 'axios';

function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [token, setToken] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      const response = await axios.post('/api/reset-password', { password, token });
      // Handle successful password reset
      console.log(response);
    } catch (error) {
      setError(error.response.data);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Password:
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label>
        Confirm Password:
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </label>
      <label>
        Token:
        <input type="text" value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button type="submit">Reset Password</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}

export default ResetPassword;