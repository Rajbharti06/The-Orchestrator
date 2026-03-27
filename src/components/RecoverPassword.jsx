import React, { useState } from 'react';
import axios from 'axios';

function RecoverPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/recover-password', { email });
      // Handle successful password recovery
      console.log(response);
    } catch (error) {
      setError(error.response.data);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email:
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit">Recover Password</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}

export default RecoverPassword;