import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { query } from '../db/database.js';
import { KlaviyoService } from '../services/klaviyo.js';

const router = express.Router();

// Get all metrics for authenticated client
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;

    // Get client's Klaviyo private key
    const clients = await query('SELECT klaviyo_private_key FROM clients WHERE id = ?', [clientId]);
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const klaviyoService = new KlaviyoService(clients[0].klaviyo_private_key);
    const metrics = await klaviyoService.getAllMetrics();

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Get specific metric category
router.get('/:category', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const { category } = req.params;

    const clients = await query('SELECT klaviyo_private_key FROM clients WHERE id = ?', [clientId]);
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const klaviyoService = new KlaviyoService(clients[0].klaviyo_private_key);
    let metrics;

    switch (category) {
      case 'campaign':
        metrics = await klaviyoService.getCampaignMetrics();
        break;
      case 'flow':
        metrics = await klaviyoService.getFlowMetrics();
        break;
      case 'event':
        metrics = await klaviyoService.getEventMetrics();
        break;
      case 'profile':
        metrics = await klaviyoService.getProfileMetrics();
        break;
      case 'revenue':
        metrics = await klaviyoService.getRevenueMetrics();
        break;
      default:
        return res.status(400).json({ error: 'Invalid metric category' });
    }

    res.json(metrics);
  } catch (error) {
    console.error(`Error fetching ${category} metrics:`, error);
    res.status(500).json({ error: `Failed to fetch ${category} metrics` });
  }
});

export default router;

