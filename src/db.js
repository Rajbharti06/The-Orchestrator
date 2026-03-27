const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'auth-system',
  password: 'password',
  port: 5432,
});

module.exports = pool;