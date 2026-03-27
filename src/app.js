const express = require('express');
const app = express();
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
const authRoutes = require('./routes/auth');
app.use(express.json());
app.use('/api', authRoutes);
app.listen(3000, () => {
  console.log('Server listening on port 3000');
});