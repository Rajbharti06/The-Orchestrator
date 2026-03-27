const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'mydb',
  password: 'password',
  port: 5432,
});
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query('INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *', [name, email, hashedPassword]);
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, 'secretkey', {
      expiresIn: '1h'
    });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registering user' });
  }
});
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user.id }, 'secretkey', {
      expiresIn: '1h'
    });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging in user' });
  }
});
router.post('/recover', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const token = jwt.sign({ userId: user.id }, 'secretkey', {
      expiresIn: '1h'
    });
    // Send recovery email with token
    res.json({ message: 'Recovery email sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error recovering password' });
  }
});
router.post('/reset', async (req, res) => {
  try {
    const { token, password } = req.body;
    const decoded = jwt.verify(token, 'secretkey');
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error resetting password' });
  }
});
module.exports = router;