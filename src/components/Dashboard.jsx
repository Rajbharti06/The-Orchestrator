import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Dashboard() {
  const [data, setData] = useState({});
  const [stats, setStats] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response1 = await axios.get('/api/dashboard/data');
        const response2 = await axios.get('/api/dashboard/stats');
        setData(response1.data);
        setStats(response2.data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchData();
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <h2>Data:</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <h2>Stats:</h2>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </div>
  );
}

export default Dashboard;