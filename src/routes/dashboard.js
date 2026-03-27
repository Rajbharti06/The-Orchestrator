const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard');
router.get('/dashboard/data', dashboardController.getDashboardData);
router.get('/dashboard/stats', dashboardController.getDashboardStats);
module.exports = router;