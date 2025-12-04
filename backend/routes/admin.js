import express from 'express';
import bcrypt from 'bcryptjs';
import { run, query } from '../db/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Add a new client (admin only - in production, add admin auth middleware)
router.post('/clients', async (req, res) => {
  try {
    const { name, email, password, klaviyo_private_key } = req.body;

    if (!name || !email || !password || !klaviyo_private_key) {
      return res.status(400).json({ 
        error: 'Name, email, password, and Klaviyo private key are required' 
      });
    }

    // Check if client already exists
    const existing = await query('SELECT * FROM clients WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Client with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert client
    const result = await run(
      'INSERT INTO clients (name, email, password, klaviyo_private_key) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, klaviyo_private_key]
    );

    res.status(201).json({
      message: 'Client created successfully',
      client: {
        id: result.id,
        name,
        email
      }
    });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all clients (admin only)
router.get('/clients', async (req, res) => {
  try {
    const clients = await query(
      'SELECT id, name, email, created_at FROM clients ORDER BY created_at DESC'
    );
    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

