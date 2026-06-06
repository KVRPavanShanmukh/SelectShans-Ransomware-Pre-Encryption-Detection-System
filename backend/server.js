const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const logsRoutes = require('./routes/logs');
const alertsRoutes = require('./routes/alerts');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5174', // Vite default port
    credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/alerts', alertsRoutes);

// Database check
const db = require('./config/db');
db.query('SELECT 1')
    .then(() => {
        console.log('[SYS] Database connection established successfully.');
        // Start Server bound to IPv4 localhost explicitly
        app.listen(PORT, '127.0.0.1', () => {
            console.log(`[SYS] SentinelStream Backend running on http://127.0.0.1:${PORT}`);
        });
    })
    .catch(err => {
        console.error('[ERR] Database connection failed. Have you imported schema.sql?');
        console.error(err.message);
        process.exit(1);
    });
