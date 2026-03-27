import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Protected() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('/api/protected');
        setData(response.data);
      } catch (error) {
        setError(error.response.data.message);
      }
    };
    fetchData();
  }, []);

  return (
    <div>
      <h1>Protected</h1>
      {data && <p>{data.message}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}

export default Protected;