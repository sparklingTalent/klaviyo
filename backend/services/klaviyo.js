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
      console.error(`Klaviyo API error for ${endpoint}:`, error.response?.data || error.message);
      // Return empty data structure instead of throwing to prevent dashboard crashes
      return { data: [] };
    }
  }

  // Campaign Metrics
  async getCampaignMetrics() {
    try {
      // Get campaigns - Klaviyo API v3 endpoint
      const campaigns = await this.makeRequest('/campaigns', { 'page[size]': 100 });
      
      let totalOpens = 0;
      let totalClicks = 0;
      let totalDelivered = 0;
      let totalBounces = 0;
      let totalRevenue = 0;

      const campaignData = campaigns?.data || [];
      
      for (const campaign of campaignData) {
        try {
          // Get campaign statistics
          const campaignId = campaign.id || campaign.attributes?.id;
          if (campaignId) {
            const stats = await this.makeRequest(`/campaigns/${campaignId}/campaign-messages`, { 'page[size]': 100 });
            
            // Aggregate statistics from campaign messages
            if (stats?.data) {
              for (const message of stats.data) {
                const metrics = message.attributes?.statistics || {};
                totalOpens += metrics.opens || 0;
                totalClicks += metrics.clicks || 0;
                totalDelivered += metrics.sent || 0;
                totalBounces += metrics.bounces || 0;
                totalRevenue += metrics.revenue || 0;
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching stats for campaign ${campaign.id}:`, err.message);
        }
      }

      const clickThroughRate = totalDelivered > 0 
        ? ((totalClicks / totalDelivered) * 100).toFixed(2) 
        : '0.00';

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

  // Flow Metrics
  async getFlowMetrics() {
    try {
      const flows = await this.makeRequest('/flows', { 'page[size]': 100 });
      
      let totalSends = 0;
      let totalConversions = 0;
      let totalRevenue = 0;

      const flowData = flows?.data || [];
      
      for (const flow of flowData) {
        try {
          const flowId = flow.id || flow.attributes?.id;
          if (flowId) {
            // Get flow actions/statistics
            const stats = await this.makeRequest(`/flows/${flowId}/flow-actions`, { 'page[size]': 100 });
            
            if (stats?.data) {
              for (const action of stats.data) {
                const metrics = action.attributes?.statistics || {};
                totalSends += metrics.sends || 0;
                totalConversions += metrics.conversions || 0;
                totalRevenue += metrics.revenue || 0;
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching stats for flow ${flow.id}:`, err.message);
        }
      }

      const conversionRate = totalSends > 0 
        ? ((totalConversions / totalSends) * 100).toFixed(2) 
        : '0.00';

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

  // Event Metrics
  async getEventMetrics() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1); // Last 30 days

      const metrics = {
        placedOrder: 0,
        viewedProduct: 0,
        addedToCart: 0,
        activeOnSite: 0
      };

      // Get events - Klaviyo API v3 uses different event endpoint structure
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
                           event.type;
          
          const eventTypeLower = (eventType || '').toLowerCase();
          
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

  // Profile Metrics
  async getProfileMetrics() {
    try {
      const profiles = await this.makeRequest('/profiles', { 'page[size]': 100 });
      const lists = await this.makeRequest('/lists', { 'page[size]': 100 });

      // Count total profiles (may need pagination for accurate count)
      const profileData = profiles?.data || [];
      const totalProfiles = profileData.length;
      
      let listMembership = 0;
      const listData = lists?.data || [];
      
      for (const list of listData) {
        try {
          const listId = list.id || list.attributes?.id;
          if (listId) {
            const members = await this.makeRequest(`/lists/${listId}/relationships/profiles`, { 'page[size]': 100 });
            listMembership += members?.data?.length || 0;
          }
        } catch (err) {
          console.error(`Error fetching members for list ${list.id}:`, err.message);
        }
      }

      // Calculate list growth (simplified - would need historical data for accurate calculation)
      const listGrowth = '0%';

      return {
        totalProfiles,
        listMembership,
        listGrowth
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

  // Revenue Metrics
  async getRevenueMetrics() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12); // Last 12 months

      let totalRevenue = 0;
      const revenueBySource = {};
      const revenueOverTime = {};

      // Get events related to orders/revenue
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
          
          // Check if it's a Placed Order event
          if (eventType.toLowerCase().includes('placed') && 
              eventType.toLowerCase().includes('order')) {
            
            // Get revenue value from event properties
            const value = event.attributes?.properties?.value || 
                         event.attributes?.value || 
                         event.attributes?.properties?.$value || 0;
            
            const revenue = parseFloat(value) || 0;
            if (revenue > 0) {
              totalRevenue += revenue;
              
              // Revenue by source
              const source = event.attributes?.properties?.$source || 
                           event.attributes?.source || 
                           'unknown';
              revenueBySource[source] = (revenueBySource[source] || 0) + revenue;
              
              // Revenue over time
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

