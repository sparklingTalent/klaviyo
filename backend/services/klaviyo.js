import axios from 'axios';

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';

export class KlaviyoService {
  constructor(privateKey) {
    this.privateKey = privateKey;
  }

  async makeRequest(endpoint, params = {}) {
    try {
      const response = await axios.get(`${KLAVIYO_API_BASE}${endpoint}`, {
        params,
        headers: {
          'Authorization': `Klaviyo-API-Key ${this.privateKey}`,
          'revision': '2024-02-15',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Klaviyo API error for ${endpoint}:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      return { data: [] };
    }
  }

  // Campaign Metrics - Using correct Klaviyo API v3 structure
  async getCampaignMetrics() {
    try {
      // Get campaigns with included relationships for statistics
      const campaigns = await this.makeRequest('/campaigns', { 
        'page[size]': 100,
        'include': 'campaign-messages'
      });
      const campaignData = campaigns?.data || [];
      const included = campaigns?.included || [];
      
      console.log(`Found ${campaignData.length} campaigns`);
      console.log(`Found ${included.length} included resources`);

      let totalOpens = 0;
      let totalClicks = 0;
      let totalDelivered = 0;
      let totalBounces = 0;
      let totalRevenue = 0;

      // Map included campaign messages by their relationship to campaigns
      const messageMap = {};
      for (const item of included) {
        if (item.type === 'campaign-message') {
          // Store messages by their ID
          messageMap[item.id] = item;
        }
      }

      for (const campaign of campaignData) {
        const campaignId = campaign.id;
        if (!campaignId) continue;

        try {
          // Get campaign messages
          const messagesResponse = await this.makeRequest(`/campaigns/${campaignId}/campaign-messages`, { 
            'page[size]': 100,
            'include': 'statistics'
          });
          const messageData = messagesResponse?.data || [];
          const messageIncluded = messagesResponse?.included || [];

          console.log(`Campaign ${campaignId} has ${messageData.length} messages`);

          // Process included statistics if available
          for (const item of messageIncluded) {
            if (item.type === 'statistics' || item.attributes) {
              const stats = item.attributes || {};
              totalOpens += parseInt(stats.opens || stats.opened_count || 0);
              totalClicks += parseInt(stats.clicks || stats.clicked_count || 0);
              totalDelivered += parseInt(stats.sent || stats.delivered || stats.delivered_count || 0);
              totalBounces += parseInt(stats.bounces || stats.bounced_count || 0);
              totalRevenue += parseFloat(stats.revenue || 0);
            }
          }

          // Process each message
          for (const message of messageData) {
            const messageId = message.id;
            const messageAttrs = message.attributes || {};
            
            // Check if message has statistics in attributes
            const stats = messageAttrs.statistics || messageAttrs || {};
            
            // Also check included data for this message
            const includedMessage = messageMap[messageId];
            if (includedMessage && includedMessage.attributes) {
              const includedStats = includedMessage.attributes.statistics || includedMessage.attributes || {};
              totalOpens += parseInt(includedStats.opens || includedStats.opened_count || stats.opens || 0);
              totalClicks += parseInt(includedStats.clicks || includedStats.clicked_count || stats.clicks || 0);
              totalDelivered += parseInt(includedStats.sent || includedStats.delivered || includedStats.delivered_count || stats.sent || 0);
              totalBounces += parseInt(includedStats.bounces || includedStats.bounced_count || stats.bounces || 0);
              totalRevenue += parseFloat(includedStats.revenue || stats.revenue || 0);
            } else {
              // Fallback: try to extract from message attributes
              totalOpens += parseInt(stats.opens || stats.opened_count || 0);
              totalClicks += parseInt(stats.clicks || stats.clicked_count || 0);
              totalDelivered += parseInt(stats.sent || stats.delivered || stats.delivered_count || 0);
              totalBounces += parseInt(stats.bounces || stats.bounced_count || 0);
              totalRevenue += parseFloat(stats.revenue || 0);
            }
          }
        } catch (err) {
          console.error(`Error processing campaign ${campaignId}:`, err.message);
          console.error('Error details:', err.response?.data || err);
        }
      }

      const clickThroughRate = totalDelivered > 0 
        ? ((totalClicks / totalDelivered) * 100).toFixed(2) 
        : '0.00';

      console.log(`Campaign totals - Opens: ${totalOpens}, Clicks: ${totalClicks}, Delivered: ${totalDelivered}, Bounces: ${totalBounces}`);

      return {
        opens: totalOpens,
        clickThroughRate: `${clickThroughRate}%`,
        delivered: totalDelivered,
        bounces: totalBounces,
        revenue: totalRevenue
      };
    } catch (error) {
      console.error('Error fetching campaign metrics:', error);
      return {
        opens: 0,
        clickThroughRate: '0.00%',
        delivered: 0,
        bounces: 0,
        revenue: 0
      };
    }
  }

  // Flow Metrics - Using correct Klaviyo API v3 structure
  async getFlowMetrics() {
    try {
      // Get flows with included relationships
      const flows = await this.makeRequest('/flows', { 
        'page[size]': 100,
        'include': 'flow-actions'
      });
      const flowData = flows?.data || [];
      const included = flows?.included || [];
      
      console.log(`Found ${flowData.length} flows`);
      console.log(`Found ${included.length} included resources`);

      let totalSends = 0;
      let totalConversions = 0;
      let totalRevenue = 0;

      // Map included flow actions
      const actionMap = {};
      for (const item of included) {
        if (item.type === 'flow-action') {
          actionMap[item.id] = item;
        }
      }

      for (const flow of flowData) {
        const flowId = flow.id;
        if (!flowId) continue;

        try {
          // Get flow actions
          const actionsResponse = await this.makeRequest(`/flows/${flowId}/flow-actions`, { 
            'page[size]': 100,
            'include': 'statistics'
          });
          const actionData = actionsResponse?.data || [];
          const actionIncluded = actionsResponse?.included || [];

          console.log(`Flow ${flowId} has ${actionData.length} actions`);

          // Process included statistics if available
          for (const item of actionIncluded) {
            if (item.type === 'statistics' || item.attributes) {
              const stats = item.attributes || {};
              totalSends += parseInt(stats.sends || stats.sent || stats.delivered || stats.delivered_count || 0);
              totalConversions += parseInt(stats.conversions || stats.converted || stats.converted_count || 0);
              totalRevenue += parseFloat(stats.revenue || 0);
            }
          }

          // Process each flow action
          for (const action of actionData) {
            const actionId = action.id;
            const actionAttrs = action.attributes || {};
            
            // Check if action has statistics in attributes
            const stats = actionAttrs.statistics || actionAttrs || {};
            
            // Also check included data for this action
            const includedAction = actionMap[actionId];
            if (includedAction && includedAction.attributes) {
              const includedStats = includedAction.attributes.statistics || includedAction.attributes || {};
              totalSends += parseInt(includedStats.sends || includedStats.sent || includedStats.delivered || stats.sends || 0);
              totalConversions += parseInt(includedStats.conversions || includedStats.converted || stats.conversions || 0);
              totalRevenue += parseFloat(includedStats.revenue || stats.revenue || 0);
            } else {
              // Fallback: try to extract from action attributes
              totalSends += parseInt(stats.sends || stats.sent || stats.delivered || stats.delivered_count || 0);
              totalConversions += parseInt(stats.conversions || stats.converted || stats.converted_count || 0);
              totalRevenue += parseFloat(stats.revenue || 0);
            }
          }
        } catch (err) {
          console.error(`Error processing flow ${flowId}:`, err.message);
          console.error('Error details:', err.response?.data || err);
        }
      }

      const conversionRate = totalSends > 0 
        ? ((totalConversions / totalSends) * 100).toFixed(2) 
        : '0.00';

      console.log(`Flow totals - Sends: ${totalSends}, Conversions: ${totalConversions}, Revenue: ${totalRevenue}`);

      return {
        flowConversionRate: `${conversionRate}%`,
        flowSends: totalSends,
        flowRevenue: totalRevenue
      };
    } catch (error) {
      console.error('Error fetching flow metrics:', error);
      return {
        flowConversionRate: '0.00%',
        flowSends: 0,
        flowRevenue: 0
      };
    }
  }

  // Event Metrics (keeping existing implementation)
  async getEventMetrics() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      const metrics = {
        placedOrder: 0,
        viewedProduct: 0,
        addedToCart: 0,
        activeOnSite: 0
      };

      try {
        const events = await this.makeRequest('/events', {
          'filter': `greater-than(datetime,${startDate.toISOString()})`,
          'page[size]': 100,
          'sort': '-datetime'
        });

        const eventData = events?.data || [];
        
        for (const event of eventData) {
          const eventType = event.attributes?.metric?.name || 
                           event.attributes?.event_name || 
                           event.type || '';
          
          const eventTypeLower = eventType.toLowerCase();
          
          if (eventTypeLower.includes('placed') && eventTypeLower.includes('order')) {
            metrics.placedOrder++;
          } else if (eventTypeLower.includes('viewed') && eventTypeLower.includes('product')) {
            metrics.viewedProduct++;
          } else if (eventTypeLower.includes('added') && eventTypeLower.includes('cart')) {
            metrics.addedToCart++;
          } else if (eventTypeLower.includes('active') && eventTypeLower.includes('site')) {
            metrics.activeOnSite++;
          }
        }
      } catch (err) {
        console.error('Error fetching events:', err.message);
      }

      return metrics;
    } catch (error) {
      console.error('Error fetching event metrics:', error);
      return {
        placedOrder: 0,
        viewedProduct: 0,
        addedToCart: 0,
        activeOnSite: 0
      };
    }
  }

  // Profile Metrics (keeping existing implementation)
  async getProfileMetrics() {
    try {
      const profiles = await this.makeRequest('/profiles', { 'page[size]': 100 });
      const lists = await this.makeRequest('/lists', { 'page[size]': 100 });

      const profileData = profiles?.data || [];
      const totalProfiles = profileData.length;
      
      let listMembership = 0;
      const listData = lists?.data || [];
      
      for (const list of listData) {
        try {
          const listId = list.id;
          if (listId) {
            const members = await this.makeRequest(`/lists/${listId}/relationships/profiles`, { 'page[size]': 100 });
            listMembership += members?.data?.length || 0;
          }
        } catch (err) {
          console.error(`Error fetching members for list ${list.id}:`, err.message);
        }
      }

      return {
        totalProfiles,
        listMembership,
        listGrowth: '0%'
      };
    } catch (error) {
      console.error('Error fetching profile metrics:', error);
      return {
        totalProfiles: 0,
        listMembership: 0,
        listGrowth: '0%'
      };
    }
  }

  // Revenue Metrics (keeping existing implementation)
  async getRevenueMetrics() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);

      let totalRevenue = 0;
      const revenueBySource = {};
      const revenueOverTime = {};

      try {
        const events = await this.makeRequest('/events', {
          'filter': `greater-than(datetime,${startDate.toISOString()})`,
          'page[size]': 100,
          'sort': '-datetime'
        });

        const eventData = events?.data || [];
        
        for (const event of eventData) {
          const eventType = event.attributes?.metric?.name || 
                           event.attributes?.event_name || 
                           '';
          
          if (eventType.toLowerCase().includes('placed') && 
              eventType.toLowerCase().includes('order')) {
            
            const value = event.attributes?.properties?.value || 
                         event.attributes?.value || 
                         event.attributes?.properties?.$value || 0;
            
            const revenue = parseFloat(value) || 0;
            if (revenue > 0) {
              totalRevenue += revenue;
              
              const source = event.attributes?.properties?.$source || 
                           event.attributes?.source || 
                           'unknown';
              revenueBySource[source] = (revenueBySource[source] || 0) + revenue;
              
              const eventDate = event.attributes?.datetime || 
                              event.attributes?.timestamp || 
                              new Date().toISOString();
              const date = new Date(eventDate).toISOString().split('T')[0];
              revenueOverTime[date] = (revenueOverTime[date] || 0) + revenue;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching revenue events:', err.message);
      }

      return {
        totalRevenue,
        revenueByEmailSource: revenueBySource,
        revenueOverTime: Object.entries(revenueOverTime)
          .map(([date, revenue]) => ({ date, revenue }))
          .sort((a, b) => new Date(a.date) - new Date(b.date))
      };
    } catch (error) {
      console.error('Error fetching revenue metrics:', error);
      return {
        totalRevenue: 0,
        revenueByEmailSource: {},
        revenueOverTime: []
      };
    }
  }

  // Get all metrics
  async getAllMetrics() {
    try {
      const [campaignMetrics, flowMetrics, eventMetrics, profileMetrics, revenueMetrics] = 
        await Promise.all([
          this.getCampaignMetrics(),
          this.getFlowMetrics(),
          this.getEventMetrics(),
          this.getProfileMetrics(),
          this.getRevenueMetrics()
        ]);

      return {
        campaign: campaignMetrics,
        flow: flowMetrics,
        event: eventMetrics,
        profile: profileMetrics,
        revenue: revenueMetrics
      };
    } catch (error) {
      console.error('Error fetching all metrics:', error);
      throw error;
    }
  }
}

