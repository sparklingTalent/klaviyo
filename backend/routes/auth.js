import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, run } from '../db/database.js';

const router = express.Router();

// Client login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const clients = await query('SELECT * FROM clients WHERE email = ?', [email]);
    
    if (clients.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const client = clients[0];
    const isValidPassword = await bcrypt.compare(password, client.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: client.id, email: client.email, type: 'client' },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      client: {
        id: client.id,
        name: client.name,
        email: client.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

