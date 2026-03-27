const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

router.use((req, res, next) => {
  const token = req.header('Authorization');
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, 'secretkey');
    req.user = decoded;
    next();
  } catch (ex) {
    return res.status(400).json({ message: 'Invalid token.' });
  }
});

router.get('/', (req, res) => {
  res.json({ message: 'Hello, ' + req.user.userId });
});