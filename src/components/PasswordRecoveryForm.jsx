import React, { useState } from 'react';
import axios from 'axios';

const PasswordRecoveryForm = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/auth/recover', { email });
      setSuccess('Password recovery email sent successfully');
    } catch (error) {
      setError(error.response.data.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>Email:</label>
      <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type='submit'>Recover Password</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </form>
  );
};

export default PasswordRecoveryForm;