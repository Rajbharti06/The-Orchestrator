const express = require('express');
const app = express();
const authRoutes = require('./routes/auth');
app.use(express.json());
app.use('/api', authRoutes);
const port = 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));