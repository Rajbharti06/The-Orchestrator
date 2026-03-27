const express = require('express');
const app = express();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

app.use(express.json());

const users = [];

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const user = { name, email, password: hashedPassword };
  users.push(user);
  res.send('User registered successfully');
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find((user) => user.email === email);
  if (!user) return res.status(401).send('Invalid email or password');
  const isValidPassword = bcrypt.compareSync(password, user.password);
  if (!isValidPassword) return res.status(401).send('Invalid email or password');
  const token = jwt.sign({ userId: user.id }, 'secretkey', { expiresIn: '1h' });
  res.send({ token });
});

app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  const user = users.find((user) => user.email === email);
  if (!user) return res.status(404).send('User not found');
  const token = jwt.sign({ userId: user.id }, 'secretkey', { expiresIn: '1h' });
  const transporter = nodemailer.createTransport({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'your-email@example.com',
      pass: 'your-password'
    }
  });
  const mailOptions = {
    from: 'your-email@example.com',
    to: user.email,
    subject: 'Password Recovery',
    text: `Reset your password: http://localhost:3000/reset-password/${token}`
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) return res.status(500).send('Error sending email');
    res.send('Password recovery email sent');
  });
});

app.post('/api/reset-password', (req, res) => {
  const { token, password } = req.body;
  const decoded = jwt.verify(token, 'secretkey');
  const user = users.find((user) => user.id === decoded.userId);
  if (!user) return res.status(404).send('User not found');
  const hashedPassword = bcrypt.hashSync(password, 10);
  user.password = hashedPassword;
  res.send('Password reset successfully');
});

app.get('/api/me', authenticate, (req, res) => {
  res.send(req.user);
});

function authenticate(req, res, next) {
  const token = req.header('Authorization');
  if (!token) return res.status(401).send('Access denied');
  try {
    const decoded = jwt.verify(token, 'secretkey');
    req.user = users.find((user) => user.id === decoded.userId);
    next();
  } catch (error) {
    res.status(400).send('Invalid token');
  }
}

const port = 3001;
app.listen(port, () => console.log(`Server started on port ${port}`));