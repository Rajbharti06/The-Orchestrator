import React, { useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const PasswordResetForm = () => {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      const response = await axios.post('/api/auth/reset', { token, password });
      setSuccess('Password reset successfully');
    } catch (error) {
      setError(error.response.data.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>New Password:</label>
      <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} />
      <label>Confirm New Password:</label>
      <input type='password' value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      <button type='submit'>Reset Password</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </form>
  );
};

export default PasswordResetForm;