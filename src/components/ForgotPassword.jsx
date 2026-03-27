import React, { useState } from 'react';
import axios from 'axios';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/forgot-password', { email });
      setSuccess('Password recovery email sent');
    } catch (error) {
      setError(error.response.data.message);
    }
  };

  return (
    <div>
      <h1>Forgot Password</h1>
      <form onSubmit={handleSubmit}>
        <label>Email:</label>
        <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type='submit'>Send Recovery Email</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </div>
  );
};

export default ForgotPassword;