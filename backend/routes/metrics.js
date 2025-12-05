import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { query } from '../db/database.js';
import { KlaviyoService } from '../services/klaviyo.js';
import axios from 'axios';

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

// Debug endpoint to see raw Klaviyo API responses
router.get('/debug/campaigns', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const clients = await query('SELECT klaviyo_private_key FROM clients WHERE id = ?', [clientId]);
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const privateKey = clients[0].klaviyo_private_key;
    
    // Get raw campaigns data
    const campaignsResponse = await axios.get('https://a.klaviyo.com/api/campaigns', {
      params: { 'page[size]': 10 },
      headers: {
        'Authorization': `Klaviyo-API-Key ${privateKey}`,
        'revision': '2024-02-15',
        'Accept': 'application/json'
      }
    });

    const campaigns = campaignsResponse.data;
    
    // If we have campaigns, try to get details for the first one
    let campaignDetails = null;
    if (campaigns?.data && campaigns.data.length > 0) {
      const firstCampaign = campaigns.data[0];
      const campaignId = firstCampaign.id;
      
      try {
        // Try to get campaign messages
        const messagesResponse = await axios.get(`https://a.klaviyo.com/api/campaigns/${campaignId}/campaign-messages`, {
          params: { 'page[size]': 10 },
          headers: {
            'Authorization': `Klaviyo-API-Key ${privateKey}`,
            'revision': '2024-02-15',
            'Accept': 'application/json'
          }
        });
        campaignDetails = {
          campaign: firstCampaign,
          messages: messagesResponse.data
        };
      } catch (err) {
        campaignDetails = {
          campaign: firstCampaign,
          messagesError: err.response?.data || err.message
        };
      }
    }

    res.json({
      campaigns: campaigns,
      sampleCampaignDetails: campaignDetails
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch debug data',
      details: error.response?.data || error.message
    });
  }
});

router.get('/debug/flows', authenticateToken, async (req, res) => {
  try {
    const clientId = req.user.id;
    const clients = await query('SELECT klaviyo_private_key FROM clients WHERE id = ?', [clientId]);
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const privateKey = clients[0].klaviyo_private_key;
    
    // Get raw flows data
    const flowsResponse = await axios.get('https://a.klaviyo.com/api/flows', {
      params: { 'page[size]': 10 },
      headers: {
        'Authorization': `Klaviyo-API-Key ${privateKey}`,
        'revision': '2024-02-15',
        'Accept': 'application/json'
      }
    });

    const flows = flowsResponse.data;
    
    // If we have flows, try to get details for the first one
    let flowDetails = null;
    if (flows?.data && flows.data.length > 0) {
      const firstFlow = flows.data[0];
      const flowId = firstFlow.id;
      
      try {
        // Try to get flow actions
        const actionsResponse = await axios.get(`https://a.klaviyo.com/api/flows/${flowId}/flow-actions`, {
          params: { 'page[size]': 10 },
          headers: {
            'Authorization': `Klaviyo-API-Key ${privateKey}`,
            'revision': '2024-02-15',
            'Accept': 'application/json'
          }
        });
        flowDetails = {
          flow: firstFlow,
          actions: actionsResponse.data
        };
      } catch (err) {
        flowDetails = {
          flow: firstFlow,
          actionsError: err.response?.data || err.message
        };
      }
    }

    res.json({
      flows: flows,
      sampleFlowDetails: flowDetails
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch debug data',
      details: error.response?.data || error.message
    });
  }
});

export default router;

