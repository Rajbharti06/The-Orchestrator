const db = require('../db');
const getDashboardData = async (req, res) => {
  try {
    const data = await db.query('SELECT * FROM dashboard_data');
    res.json(data.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
};
const getDashboardStats = async (req, res) => {
  try {
    const stats = await db.query('SELECT * FROM dashboard_stats');
    res.json(stats.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching dashboard stats' });
  }
};
module.exports = { getDashboardData, getDashboardStats };