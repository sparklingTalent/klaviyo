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

  // Campaign Metrics - Simplified approach
  async getCampaignMetrics() {
    try {
      const campaigns = await this.makeRequest('/campaigns', { 'page[size]': 100 });
      const campaignData = campaigns?.data || [];
      
      console.log(`Found ${campaignData.length} campaigns`);
      if (campaignData.length > 0) {
        console.log('Sample campaign structure:', JSON.stringify(campaignData[0], null, 2));
      }

      let totalOpens = 0;
      let totalClicks = 0;
      let totalDelivered = 0;
      let totalBounces = 0;
      let totalRevenue = 0;

      for (const campaign of campaignData) {
        const campaignId = campaign.id;
        if (!campaignId) continue;

        try {
          // Get campaign messages
          const messages = await this.makeRequest(`/campaigns/${campaignId}/campaign-messages`, { 'page[size]': 100 });
          const messageData = messages?.data || [];

          console.log(`Campaign ${campaignId} has ${messageData.length} messages`);

          for (const message of messageData) {
            // Check if statistics are in the message attributes
            const stats = message.attributes?.statistics || message.attributes || {};
            
            totalOpens += parseInt(stats.opens || stats.opened_count || stats.email_opened || 0);
            totalClicks += parseInt(stats.clicks || stats.clicked_count || stats.email_clicked || 0);
            totalDelivered += parseInt(stats.sent || stats.delivered || stats.delivered_count || 0);
            totalBounces += parseInt(stats.bounces || stats.bounced || stats.bounced_count || 0);
            totalRevenue += parseFloat(stats.revenue || stats.revenue_total || 0);
          }

          // If no messages, try to get campaign-level statistics
          if (messageData.length === 0) {
            const campaignStats = campaign.attributes?.statistics || campaign.attributes || {};
            totalOpens += parseInt(campaignStats.opens || campaignStats.opened_count || 0);
            totalClicks += parseInt(campaignStats.clicks || campaignStats.clicked_count || 0);
            totalDelivered += parseInt(campaignStats.sent || campaignStats.delivered || 0);
            totalBounces += parseInt(campaignStats.bounces || campaignStats.bounced_count || 0);
            totalRevenue += parseFloat(campaignStats.revenue || 0);
          }
        } catch (err) {
          console.error(`Error processing campaign ${campaignId}:`, err.message);
        }
      }

      const clickThroughRate = totalDelivered > 0 
        ? ((totalClicks / totalDelivered) * 100).toFixed(2) 
        : '0.00';

      console.log(`Campaign totals - Opens: ${totalOpens}, Clicks: ${totalClicks}, Delivered: ${totalDelivered}`);

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

  // Flow Metrics - Simplified approach
  async getFlowMetrics() {
    try {
      const flows = await this.makeRequest('/flows', { 'page[size]': 100 });
      const flowData = flows?.data || [];
      
      console.log(`Found ${flowData.length} flows`);
      if (flowData.length > 0) {
        console.log('Sample flow structure:', JSON.stringify(flowData[0], null, 2));
      }

      let totalSends = 0;
      let totalConversions = 0;
      let totalRevenue = 0;

      for (const flow of flowData) {
        const flowId = flow.id;
        if (!flowId) continue;

        try {
          // Get flow actions
          const actions = await this.makeRequest(`/flows/${flowId}/flow-actions`, { 'page[size]': 100 });
          const actionData = actions?.data || [];

          console.log(`Flow ${flowId} has ${actionData.length} actions`);

          for (const action of actionData) {
            // Check if statistics are in the action attributes
            const stats = action.attributes?.statistics || action.attributes || {};
            
            totalSends += parseInt(stats.sends || stats.sent || stats.delivered || stats.delivered_count || 0);
            totalConversions += parseInt(stats.conversions || stats.converted || stats.converted_count || 0);
            totalRevenue += parseFloat(stats.revenue || stats.revenue_total || 0);
          }

          // If no actions, try to get flow-level statistics
          if (actionData.length === 0) {
            const flowStats = flow.attributes?.statistics || flow.attributes || {};
            totalSends += parseInt(flowStats.sends || flowStats.sent || 0);
            totalConversions += parseInt(flowStats.conversions || flowStats.converted || 0);
            totalRevenue += parseFloat(flowStats.revenue || 0);
          }
        } catch (err) {
          console.error(`Error processing flow ${flowId}:`, err.message);
        }
      }

      const conversionRate = totalSends > 0 
        ? ((totalConversions / totalSends) * 100).toFixed(2) 
        : '0.00';

      console.log(`Flow totals - Sends: ${totalSends}, Conversions: ${totalConversions}`);

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

