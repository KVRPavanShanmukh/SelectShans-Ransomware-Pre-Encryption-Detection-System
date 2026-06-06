const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        // In a real app, generate OTP and email it here
        res.json({ message: 'Step 1 success, proceed to OTP', username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/verify-sq (Final Step -> Returns JWT)
router.post('/verify-sq', async (req, res) => {
    try {
        const { username, answer } = req.body; // Answer from the frontend (security question)

        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = rows[0];
        // Check answer - in our schema it's a bcrypt hash of lowercase answer (e.g. "11" or "randomforest")
        const isMatch = await bcrypt.compare(answer.toLowerCase().trim(), user.sec_a_hash);

        if (!isMatch) return res.status(401).json({ message: 'Incorrect security answer' });

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET || 'sentinelstream_super_secret_jwt_key_2024',
            { expiresIn: '8h' }
        );

        res.json({ token, message: 'Authentication fully complete' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
