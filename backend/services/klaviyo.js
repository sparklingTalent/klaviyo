import axios from 'axios';

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';

export class KlaviyoService {
  constructor(privateKey) {
    this.privateKey = privateKey;
    this.baseURL = KLAVIYO_API_BASE;
    this.lastRequestTime = 0;
    this.minRequestInterval = 250; // 250ms between requests = max 4 requests per second (safe limit)
  }

  // Wait/delay function
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Rate limiting: ensure minimum delay between requests
  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await this.wait(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  // Helper method to make authenticated requests using Klaviyo API v3
  // Includes rate limiting and retry logic for 429 throttling errors
  async makeRequest(endpoint, method = 'GET', data = null, params = {}, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      // Rate limiting: ensure minimum delay between requests
      await this.rateLimit();
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Klaviyo-API-Key ${this.privateKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'revision': '2024-10-15' // Use latest API revision
        }
      };

      // For GET requests, use params; for POST/PUT/PATCH, use data
      if (method === 'GET') {
        config.params = params;
      } else if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      // Handle 429 throttling errors with retry
      if (error.response?.status === 429 && retryCount < maxRetries) {
        const retryAfter = error.response?.data?.errors?.[0]?.detail?.match(/(\d+)\s*second/i);
        const waitTime = retryAfter ? parseInt(retryAfter[1]) * 1000 : 1000; // Default 1 second
        
        console.log(`Throttled (429). Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}...`);
        await this.wait(waitTime);
        
        // Retry the request
        return this.makeRequest(endpoint, method, data, params, retryCount + 1);
      }

      // Log error for non-throttling errors
      const errorData = error.response?.data || error.message;
      console.error('Klaviyo API Error:', errorData);
      
      // Extract error message from Klaviyo error format
      let errorMessage = error.message;
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        errorMessage = error.response.data.errors[0].detail || error.response.data.errors[0].title;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      throw new Error(`Klaviyo API Error: ${errorMessage}`);
    }
  }

  // Get account information (using v3 API)
  async getAccount() {
    try {
      // Try to get account info via profiles endpoint or account endpoint
      const response = await this.makeRequest('/accounts/', 'GET');
      return response;
    } catch (error) {
      // If accounts endpoint doesn't work, return basic info
      return { name: 'Klaviyo Account', contact_email: 'N/A' };
    }
  }

  // Get all metrics (returns list of metric IDs and basic info)
  async getMetrics() {
    try {
      const response = await this.makeRequest('/metrics/', 'GET');
      return response;
    } catch (error) {
      return { data: [] };
    }
  }

  // Get detailed metric data by metric ID
  async getMetricById(metricId, params = {}) {
    try {
      const response = await this.makeRequest(`/metrics/${metricId}/`, 'GET', null, params);
      return response;
    } catch (error) {
      console.error(`Error fetching metric ${metricId}:`, error.message);
      return null;
    }
  }

  // Get metric statistics/aggregates by metric ID
  async getMetricStatistics(metricId, params = {}) {
    try {
      // Try to get metric statistics - this endpoint may vary based on Klaviyo API
      const response = await this.makeRequest(`/metrics/${metricId}/`, 'GET', null, params);
      return response;
    } catch (error) {
      console.error(`Error fetching metric statistics for ${metricId}:`, error.message);
      return null;
    }
  }

  // Get all metrics with their detailed data
  // Uses sequential requests with rate limiting to avoid throttling
  async getAllMetricsWithDetails() {
    try {
      // First, get all metric IDs
      const metricsResponse = await this.getMetrics();
      const metrics = metricsResponse?.data || [];
      
      if (metrics.length === 0) {
        return { metrics: [], details: [] };
      }

      // Fetch detailed data for each metric sequentially (with rate limiting)
      // Limit to first 20 to avoid too many requests
      const details = [];
      const metricsToFetch = metrics.slice(0, 20);
      
      for (const metric of metricsToFetch) {
        try {
          const detail = await this.getMetricById(metric.id);
          if (detail) {
            details.push(detail);
          }
          // Rate limiting is handled in makeRequest, but we add extra delay for safety
          await this.wait(250); // 250ms between requests = max 4 requests/second
        } catch (error) {
          console.error(`Error fetching metric ${metric.id}:`, error.message);
          // Continue with next metric even if one fails
        }
      }

      return {
        metrics: metrics,
        details: details,
        total: metrics.length
      };
    } catch (error) {
      console.error('Error fetching metrics with details:', error.message);
      return { metrics: [], details: [], total: 0 };
    }
  }

  // Get campaigns (using v3 API)
  // Note: Klaviyo v3 requires a channel filter per Campaigns API documentation
  // https://developers.klaviyo.com/en/reference/campaigns_api_overview
  async getCampaigns() {
    try {
      // Fetch both email and SMS campaigns
      const [emailCampaigns, smsCampaigns] = await Promise.allSettled([
        this.makeRequest('/campaigns/', 'GET', null, {
          'filter': "equals(messages.channel,'email')"
        }).catch(() => ({ data: [] })),
        this.makeRequest('/campaigns/', 'GET', null, {
          'filter': "equals(messages.channel,'sms')"
        }).catch(() => ({ data: [] }))
      ]);

      const emailData = emailCampaigns.status === 'fulfilled' ? emailCampaigns.value : { data: [] };
      const smsData = smsCampaigns.status === 'fulfilled' ? smsCampaigns.value : { data: [] };

      // Combine both email and SMS campaigns
      const allCampaigns = [
        ...(emailData.data || []),
        ...(smsData.data || [])
      ];

      return { data: allCampaigns };
    } catch (error) {
      return { data: [] };
    }
  }

  // Get campaign messages (renamed to avoid conflict)
  async getCampaignMessages(campaignId) {
    try {
      const response = await this.makeRequest(`/campaigns/${campaignId}/campaign-messages/`, 'GET');
      return response;
    } catch (error) {
      return null;
    }
  }

  // Get flows
  async getFlows() {
    try {
      const response = await this.makeRequest('/flows/', 'GET');
      return response;
    } catch (error) {
      return { data: [] };
    }
  }

  // Get lists (using v3 API)
  async getLists() {
    try {
      const response = await this.makeRequest('/lists/', 'GET');
      return response;
    } catch (error) {
      return { data: [] };
    }
  }

  // Get profiles count (using v3 API)
  async getProfiles(params = {}) {
    try {
      const response = await this.makeRequest('/profiles/', 'GET', null, {
        'page[size]': 1,
        ...params
      });
      return response;
    } catch (error) {
      throw error;
    }
  }

  // Get events (using v3 API)
  async getEvents(params = {}) {
    try {
      const response = await this.makeRequest('/events/', 'GET', null, params);
      return response;
    } catch (error) {
      throw error;
    }
  }

  // Get specific metric data (alias for getMetricById for backward compatibility)
  async getMetricData(metricId, params = {}) {
    return this.getMetricById(metricId, params);
  }

  // Get events by metric ID (correct way to filter events)
  // API: GET /api/events/?filter=equals(metric_id,"<metricId>")
  async getEventsByMetricId(metricId, params = {}) {
    try {
      const filter = `equals(metric_id,"${metricId}")`;
      const requestParams = {
        'filter': filter,
        ...params
      };
      
      console.log(`Fetching events with filter: ${filter}`);
      
      const response = await this.makeRequest('/events/', 'GET', null, requestParams);
      
      // Log response summary
      const eventCount = response?.data?.length || 0;
      console.log(`Received ${eventCount} events for metric ID: ${metricId}`);
      
      return response;
    } catch (error) {
      console.error(`Error fetching events for metric ${metricId}:`, error.message);
      return { data: [] };
    }
  }

  // Get all events by metric ID (paginates through all pages)
  // Follows the same pattern as the sample: fetch all pages using links.next
  async getAllEventsByMetricId(metricId) {
    try {
      const filter = `equals(metric_id,"${metricId}")`;
      let allEvents = [];
      let url = null;
      let firstRequest = true;
      let pageCount = 0;

      while (firstRequest || url) {
        let response;
        
        if (firstRequest) {
          // First request: use filter and page size
          const requestParams = { 
            'filter': filter, 
            'page[size]': 100 
          };
          response = await this.makeRequest('/events/', 'GET', null, requestParams);
        } else {
          // Subsequent requests: use the full URL from links.next directly
          // links.next is a full URL like https://a.klaviyo.com/api/events/?page[cursor]=...
          // Extract path and query, but remove the /api prefix since baseURL already includes it
          const urlObj = new URL(url);
          let path = urlObj.pathname + urlObj.search;
          
          // Remove /api prefix if present (since baseURL already includes /api)
          if (path.startsWith('/api/')) {
            path = path.substring(4); // Remove '/api' but keep the leading '/'
          }
          
          response = await this.makeRequest(path, 'GET');
        }
        
        if (response?.data) {
          allEvents = allEvents.concat(response.data);
          pageCount++;
          console.log(`Fetched page ${pageCount}: ${response.data.length} events (total: ${allEvents.length})`);
        }
        
        // Get next page URL from links
        url = response?.links?.next || null;
        firstRequest = false;
      }

      console.log(`Fetched ${allEvents.length} total events for metric ID: ${metricId}`);
      return { data: allEvents };
    } catch (error) {
      console.error(`Error fetching all events for metric ${metricId}:`, error.message);
      return { data: [] };
    }
  }

  // Query Metric Aggregates endpoint helper
  // Used for calculating flow metrics (sends, conversions, revenue)
  async queryMetricAggregates(metricId, options = {}) {
    try {
      const {
        measurements = ['count'], // 'count', 'unique', 'sum_value'
        filters = [],
        interval = null,
        timezone = "UTC",
        by = null // Group by dimension (e.g., ["$attributed_message"])
      } = options;

      const requestBody = {
        data: {
          type: "metric-aggregate",
          attributes: {
            measurements: measurements,
            metric_id: metricId,
            timezone: timezone
          }
        }
      };

      // Filter is REQUIRED for metric-aggregates endpoint
      // If no filters provided, use a default date range (last 1 year)
      if (!filters || filters.length === 0) {
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        filters = [
          `greater-or-equal(datetime,${oneYearAgo.toISOString()})`,
          `less-than(datetime,${now.toISOString()})`
        ];
      }
      requestBody.data.attributes.filter = filters;

      if (interval) {
        requestBody.data.attributes.interval = interval;
      }

      if (by && Array.isArray(by) && by.length > 0) {
        requestBody.data.attributes.by = by;
      }

      const response = await this.makeRequest('/metric-aggregates/', 'POST', requestBody);

      // Extract total from response
      let total = 0;
      let groupedData = {}; // For grouped results (e.g., by flow ID)
      
      if (response?.data?.attributes?.data) {
        response.data.attributes.data.forEach(group => {
          const measurements = group?.measurements;
          const measurementKey = measurements?.unique ? 'unique' : 
                                 measurements?.count ? 'count' : 
                                 measurements?.sum_value ? 'sum_value' : null;
          
          let value = 0;
          if (measurementKey && measurements[measurementKey]) {
            if (Array.isArray(measurements[measurementKey])) {
              value = measurements[measurementKey].reduce((acc, val) => {
                const num = parseFloat(val);
                return acc + (isNaN(num) ? 0 : num);
              }, 0);
            } else {
              const num = parseFloat(measurements[measurementKey]);
              value = isNaN(num) ? 0 : num;
            }
          }

          total += value;

          // If grouped by dimension, store per-group data
          // When using 'by' parameter, each group has dimensions array
          if (by && group?.dimensions && Array.isArray(group.dimensions) && group.dimensions.length > 0) {
            const dimension = group.dimensions[0];
            // Extract the dimension value (could be $attributed_message, $message, $flow, etc.)
            const dimensionValue = dimension?.$attributed_message || 
                                  dimension?.$message ||
                                  dimension?.$flow ||
                                  dimension?.$campaign ||
                                  'unknown';
            
            // If measurements are arrays (when interval is used), sum all values
            // Otherwise, use the single value
            if (Array.isArray(measurements[measurementKey])) {
              const groupTotal = measurements[measurementKey].reduce((acc, val) => {
                const num = parseFloat(val);
                return acc + (isNaN(num) ? 0 : num);
              }, 0);
              groupedData[dimensionValue] = (groupedData[dimensionValue] || 0) + groupTotal;
            } else {
              groupedData[dimensionValue] = (groupedData[dimensionValue] || 0) + value;
            }
          }
        });
      }

      return { 
        total: total,
        grouped: groupedData // Returns grouped data if 'by' parameter was used
      };
    } catch (error) {
      console.error(`Error querying metric aggregates for ${metricId}:`, error.message);
      return { total: 0, grouped: {} };
    }
  }

  // Get campaign metrics using Query Metric Aggregates endpoint
  // Per Klaviyo documentation: https://developers.klaviyo.com/en/docs/using_the_query_metric_aggregates_endpoint
  // Groups by $attributed_message to get campaign-specific metrics
  async getCampaignMetrics(options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        timezone = "UTC"
      } = options;

      // Build base filters for date range
      // Default to last 1 year if not provided
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      
      const baseFilters = [];
      if (startDate && endDate) {
        baseFilters.push(`greater-or-equal(datetime,${startDate})`);
        baseFilters.push(`less-than(datetime,${endDate})`);
      } else {
        // Default to last 1 year
        baseFilters.push(`greater-or-equal(datetime,${oneYearAgo.toISOString()})`);
        baseFilters.push(`less-than(datetime,${now.toISOString()})`);
      }

      // First, get all metrics to find the metric IDs for email events
      const allMetricsResponse = await this.getMetrics();
      const allMetrics = allMetricsResponse?.data || [];

      // Find metric IDs for email engagement metrics
      const findMetricId = (searchName) => {
        const metric = allMetrics.find(m => {
          const name = m?.attributes?.name || m?.name || '';
          return name.toLowerCase().includes(searchName.toLowerCase());
        });
        return metric?.id || null;
      };

      const openedEmailId = findMetricId('opened email');
      const clickedEmailId = findMetricId('clicked email');
      const receivedEmailId = findMetricId('received email');
      const bouncedEmailId = findMetricId('bounced') || findMetricId('bounce');
      const placedOrderId = findMetricId('placed order');

      console.log('Campaign metric IDs:', {
        opened: openedEmailId,
        clicked: clickedEmailId,
        received: receivedEmailId,
        bounced: bouncedEmailId,
        placedOrder: placedOrderId
      });

      // Query metric aggregates grouped by $attributed_message (campaigns)
      // Per documentation: group by $attributed_message to get per-campaign metrics
      const campaignMetricsPromises = [];

      // Get unique opens (grouped by campaign)
      // Per documentation: Use "Opened Email" metric with "unique" measurement
      if (openedEmailId) {
        campaignMetricsPromises.push(
          this.queryMetricAggregates(openedEmailId, {
            measurements: ['unique'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        campaignMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      // Get unique clicks (grouped by campaign)
      // Per documentation: Use "Clicked Email" metric with "unique" measurement
      if (clickedEmailId) {
        campaignMetricsPromises.push(
          this.queryMetricAggregates(clickedEmailId, {
            measurements: ['unique'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        campaignMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      // Get total delivered/received (grouped by campaign)
      // Per documentation: Use "Received Email" metric with "count" measurement
      if (receivedEmailId) {
        campaignMetricsPromises.push(
          this.queryMetricAggregates(receivedEmailId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        campaignMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      // Get bounces (grouped by campaign)
      if (bouncedEmailId) {
        campaignMetricsPromises.push(
          this.queryMetricAggregates(bouncedEmailId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        campaignMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      // Get revenue (grouped by campaign)
      // Per documentation: Use "Placed Order" metric with "sum_value" measurement
      if (placedOrderId) {
        campaignMetricsPromises.push(
          this.queryMetricAggregates(placedOrderId, {
            measurements: ['sum_value'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        campaignMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      const [opensResult, clicksResult, deliveredResult, bouncesResult, revenueResult] = await Promise.allSettled(campaignMetricsPromises);

      const opensData = opensResult.status === 'fulfilled' ? opensResult.value : { total: 0, grouped: {} };
      const clicksData = clicksResult.status === 'fulfilled' ? clicksResult.value : { total: 0, grouped: {} };
      const deliveredData = deliveredResult.status === 'fulfilled' ? deliveredResult.value : { total: 0, grouped: {} };
      const bouncesData = bouncesResult.status === 'fulfilled' ? bouncesResult.value : { total: 0, grouped: {} };
      const revenueData = revenueResult.status === 'fulfilled' ? revenueResult.value : { total: 0, grouped: {} };

      // Calculate totals across all campaigns
      const totalOpens = opensData.total || 0;
      const totalClicks = clicksData.total || 0;
      const totalDelivered = deliveredData.total || 0;
      const totalBounces = bouncesData.total || 0;
      const totalRevenue = revenueData.total || 0;

      // Calculate click-through rate (CTR)
      const clickThroughRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;

      console.log('Campaign metrics calculated:', {
        opens: totalOpens,
        clicks: totalClicks,
        delivered: totalDelivered,
        bounces: totalBounces,
        revenue: totalRevenue,
        clickThroughRate: clickThroughRate.toFixed(2) + '%'
      });

      return {
        opens: totalOpens,
        clicks: totalClicks,
        delivered: totalDelivered,
        bounces: totalBounces,
        revenue: totalRevenue,
        clickThroughRate: clickThroughRate.toFixed(2) + '%',
        // Include grouped data for per-campaign breakdown
        grouped: {
          opens: opensData.grouped || {},
          clicks: clicksData.grouped || {},
          delivered: deliveredData.grouped || {},
          bounces: bouncesData.grouped || {},
          revenue: revenueData.grouped || {}
        }
      };
    } catch (error) {
      console.error('Error calculating campaign metrics:', error.message);
      return {
        opens: 0,
        clicks: 0,
        delivered: 0,
        bounces: 0,
        revenue: 0,
        clickThroughRate: '0.00%',
        grouped: {}
      };
    }
  }

  // Get flow metrics using Query Metric Aggregates endpoint
  // Per Klaviyo documentation: https://developers.klaviyo.com/en/docs/using_the_query_metric_aggregates_endpoint
  // Groups by $attributed_message to get flow-specific metrics
  async getFlowMetrics(options = {}) {
    try {
      const {
        timezone = "UTC"
      } = options;

      // Flow metrics need date filters (required by API)
      // Use last 1 year as default
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      const baseFilters = [
        `greater-or-equal(datetime,${oneYearAgo.toISOString()})`,
        `less-than(datetime,${now.toISOString()})`
      ];

      // First, get all metrics to find the metric IDs
      const allMetricsResponse = await this.getMetrics();
      const allMetrics = allMetricsResponse?.data || [];

      // Find metric IDs for flow metrics
      const findMetricId = (searchName) => {
        const metric = allMetrics.find(m => {
          const name = m?.attributes?.name || m?.name || '';
          return name.toLowerCase().includes(searchName.toLowerCase());
        });
        return metric?.id || null;
      };

      const receivedEmailId = findMetricId('received email');
      const placedOrderId = findMetricId('placed order');

      console.log('Flow metric IDs:', {
        received: receivedEmailId,
        placedOrder: placedOrderId
      });

      // Query metric aggregates grouped by $attributed_message (flows)
      // This will return metrics per flow
      const flowMetricsPromises = [];

      // Get flow sends (Received Email count, grouped by flow)
      if (receivedEmailId) {
        flowMetricsPromises.push(
          this.queryMetricAggregates(receivedEmailId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by flow
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        flowMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      // Get flow conversions (Placed Order count, grouped by flow)
      if (placedOrderId) {
        flowMetricsPromises.push(
          this.queryMetricAggregates(placedOrderId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by flow
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        flowMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      // Get flow revenue (Placed Order sum_value, grouped by flow)
      if (placedOrderId) {
        flowMetricsPromises.push(
          this.queryMetricAggregates(placedOrderId, {
            measurements: ['sum_value'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by flow
            timezone: timezone
          }).catch(() => ({ total: 0, grouped: {} }))
        );
      } else {
        flowMetricsPromises.push(Promise.resolve({ total: 0, grouped: {} }));
      }

      const [sendsResult, conversionsResult, revenueResult] = await Promise.allSettled(flowMetricsPromises);

      const sendsData = sendsResult.status === 'fulfilled' ? sendsResult.value : { total: 0, grouped: {} };
      const conversionsData = conversionsResult.status === 'fulfilled' ? conversionsResult.value : { total: 0, grouped: {} };
      const revenueData = revenueResult.status === 'fulfilled' ? revenueResult.value : { total: 0, grouped: {} };

      // Calculate totals across all flows
      const totalSends = sendsData.total || 0;
      const totalConversions = conversionsData.total || 0;
      const totalRevenue = revenueData.total || 0;

      // Calculate conversion rate
      const conversionRate = totalSends > 0 ? (totalConversions / totalSends) * 100 : 0;

      console.log('Flow metrics calculated:', {
        sends: totalSends,
        conversions: totalConversions,
        conversionRate: conversionRate.toFixed(2) + '%',
        revenue: totalRevenue
      });

      return {
        flowSends: totalSends,
        flowConversions: totalConversions,
        flowConversionRate: conversionRate.toFixed(2) + '%',
        flowRevenue: totalRevenue,
        // Include grouped data for per-flow breakdown (optional, for future use)
        grouped: {
          sends: sendsData.grouped || {},
          conversions: conversionsData.grouped || {},
          revenue: revenueData.grouped || {}
        }
      };
    } catch (error) {
      console.error('Error calculating flow metrics:', error.message);
      return {
        flowSends: 0,
        flowConversions: 0,
        flowConversionRate: '0.00%',
        flowRevenue: 0,
        grouped: {}
      };
    }
  }

  // Calculate revenue using Query Metric Aggregates endpoint
  // This is the recommended way per Klaviyo documentation
  // https://developers.klaviyo.com/en/docs/using_the_query_metric_aggregates_endpoint
  async calculateRevenueByMetricId(metricId, options = {}) {
    try {
      const {
        startDate = null, // ISO date string, e.g., "2022-01-01T00:00:00"
        endDate = null,   // ISO date string, e.g., "2022-12-31T23:59:59"
        interval = null,   // "hour", "day", "week", "month" (optional)
        timezone = "UTC", // Timezone for date calculations
        attributedMessage = null // Filter by specific campaign/flow ID (optional)
      } = options;

      console.log(`Calculating revenue for metric ID: ${metricId} using Metric Aggregates endpoint`);

      // Build filter array - filter is REQUIRED for metric-aggregate endpoint
      const filters = [];
      
      // Default date range: last 1 month to today if not specified
      const now = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);
      
      const defaultStartDate = startDate || oneMonthAgo.toISOString();
      const defaultEndDate = endDate || now.toISOString();
      
      // Date filters are always required
      filters.push(`greater-or-equal(datetime,${defaultStartDate})`);
      filters.push(`less-than(datetime,${defaultEndDate})`);
      
      // Add attributed message filter if specified
      if (attributedMessage) {
        filters.push(`equals($attributed_message,"${attributedMessage}")`);
      }

      // Build request body for Query Metric Aggregates endpoint
      // Filter is REQUIRED - always include date range filters
      const requestBody = {
        data: {
          type: "metric-aggregate",
          attributes: {
            measurements: ["sum_value"], // Sum of $value property
            metric_id: metricId,
            filter: filters, // REQUIRED field - always include date filters
            timezone: timezone
          }
        }
      };

      // Add interval if specified
      if (interval) {
        requestBody.data.attributes.interval = interval;
      }

      // Make POST request to metric-aggregates endpoint
      const response = await this.makeRequest('/metric-aggregates/', 'POST', requestBody);
      
      // Extract revenue from response
      // Response structure per Klaviyo docs:
      // { data: { type: "metric-aggregate", attributes: { data: [{ measurements: { sum_value: [...] } }] } } }
      let totalRevenue = 0;
      let eventCount = 0;
      const revenueOverTime = {};

      if (response?.data?.attributes?.data) {
        const aggregateData = response.data.attributes.data;
        
        aggregateData.forEach((group, index) => {
          const measurements = group?.measurements;
          
          // Extract sum_value (revenue)
          if (measurements?.sum_value) {
            // If interval is specified, sum_value is an array of values per interval
            if (Array.isArray(measurements.sum_value)) {
              const sum = measurements.sum_value.reduce((acc, val) => {
                const num = parseFloat(val);
                return acc + (isNaN(num) ? 0 : num);
              }, 0);
              totalRevenue += sum;

              // If interval is used, we can extract time-based revenue
              if (interval && group?.time) {
                revenueOverTime[group.time] = sum;
              }
            } else {
              // If no interval, sum_value is a single number
              const num = parseFloat(measurements.sum_value);
              totalRevenue += isNaN(num) ? 0 : num;
            }
          }
          
          // Get count if available (for event count)
          if (measurements?.count) {
            if (Array.isArray(measurements.count)) {
              eventCount += measurements.count.reduce((acc, val) => {
                const num = parseInt(val);
                return acc + (isNaN(num) ? 0 : num);
              }, 0);
            } else {
              const num = parseInt(measurements.count);
              eventCount += isNaN(num) ? 0 : num;
            }
          }
        });
      } else {
        console.warn('Unexpected response structure from Metric Aggregates endpoint:', JSON.stringify(response, null, 2));
      }

      console.log(`Revenue calculation (Metric Aggregates): $${totalRevenue.toFixed(2)} from ${eventCount} events`);

      return {
        totalRevenue: totalRevenue,
        eventCount: eventCount,
        revenueOverTime: Object.entries(revenueOverTime)
          .map(([date, revenue]) => ({ date, revenue }))
          .sort((a, b) => new Date(a.date) - new Date(b.date)),
        method: 'metric-aggregates'
      };
    } catch (error) {
      console.error(`Error calculating revenue for metric ${metricId}:`, error.message);
      // Fallback to event-based calculation if aggregate endpoint fails
      console.log('Falling back to event-based revenue calculation...');
      return this.calculateRevenueFromEvents(metricId);
    }
  }

  // Fallback method: Calculate revenue from individual events (for first 100 events)
  // Used as fallback if Metric Aggregates endpoint is not available
  async calculateRevenueFromEvents(metricId, limit = 100) {
    try {
      console.log(`Calculating revenue from events for metric ID: ${metricId} (first ${limit} events)`);
      
      const filter = `equals(metric_id,"${metricId}")`;
      const requestParams = { 
        'filter': filter, 
        'page[size]': limit 
      };
      
      const eventsResponse = await this.makeRequest('/events/', 'GET', null, requestParams);
      const events = eventsResponse?.data || [];
      
      let totalRevenue = 0;
      let eventsWithRevenue = 0;
      const revenueOverTime = {};

      events.forEach(event => {
        const props = event?.attributes?.properties;
        if (props?.$value) {
          const value = parseFloat(props.$value) || 0;
          totalRevenue += value;
          eventsWithRevenue++;

          // Track revenue over time
          const eventDate = event?.attributes?.datetime || event?.attributes?.time;
          if (eventDate) {
            const date = new Date(eventDate).toISOString().split('T')[0];
            revenueOverTime[date] = (revenueOverTime[date] || 0) + value;
          }
        }
      });

      console.log(`Revenue calculation (events): $${totalRevenue.toFixed(2)} from ${eventsWithRevenue} events with revenue out of ${events.length} total events`);

      return {
        totalRevenue: totalRevenue,
        eventCount: events.length,
        eventsWithRevenue: eventsWithRevenue,
        revenueOverTime: Object.entries(revenueOverTime)
          .map(([date, revenue]) => ({ date, revenue }))
          .sort((a, b) => new Date(a.date) - new Date(b.date)),
        method: 'events'
      };
    } catch (error) {
      console.error(`Error calculating revenue from events for metric ${metricId}:`, error.message);
      return {
        totalRevenue: 0,
        eventCount: 0,
        eventsWithRevenue: 0,
        revenueOverTime: [],
        method: 'events'
      };
    }
  }

  // Find metric ID by name (helper function)
  // Metric structure: { type, id, attributes: { name, ... }, relationships, links }
  async findMetricIdByName(metricName) {
    try {
      const metricsResponse = await this.getMetrics();
      const metrics = metricsResponse?.data || [];
      
      // Search for metric by name (case-insensitive)
      // Access metric name from attributes.name (Klaviyo API v3 structure)
      const metric = metrics.find(m => {
        const name = m?.attributes?.name || m?.name || '';
        return name.toLowerCase() === metricName.toLowerCase();
      });
      
      if (metric) {
        console.log(`Found metric "${metricName}" with ID: ${metric.id}`);
        return metric.id;
      }
      
      console.warn(`Metric "${metricName}" not found`);
      return null;
    } catch (error) {
      console.error(`Error finding metric ID for ${metricName}:`, error.message);
      return null;
    }
  }

  // Get events by metric name (convenience method - finds ID first, then fetches events)
  async getEventsByMetric(metricName, params = {}) {
    try {
      const metricId = await this.findMetricIdByName(metricName);
      if (!metricId) {
        console.warn(`Metric "${metricName}" not found`);
        return { data: [] };
      }
      return this.getEventsByMetricId(metricId, params);
    } catch (error) {
      console.error(`Error fetching events for metric "${metricName}":`, error.message);
      return { data: [] };
    }
  }

  // Event Metrics - Get event counts using Query Metric Aggregates
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
        // Step 1: First, get all metrics to find the metric IDs
        const allMetricsResponse = await this.getMetrics();
        const allMetrics = allMetricsResponse?.data || [];
        
        // Step 2: Find metric IDs for key event types
        const findMetricId = (searchName) => {
          const metric = allMetrics.find(m => {
            const metricName = m?.attributes?.name || m?.name || '';
            return metricName.toLowerCase().includes(searchName.toLowerCase());
          });
          return metric?.id || null;
        };

        const findExactMetricId = (exactName) => {
          const metric = allMetrics.find(m => {
            const metricName = m?.attributes?.name || m?.name || '';
            return metricName.toLowerCase() === exactName.toLowerCase();
          });
          return metric?.id || null;
        };

        // Find metric IDs
        const placedOrderId = findExactMetricId('Placed Order') || findMetricId('placed order');
        const viewedProductId = findMetricId('viewed product');
        const addedToCartId = findMetricId('added to cart');
        const activeOnSiteId = findMetricId('active on site');

        console.log('Found metric IDs for events:', {
          placedOrder: placedOrderId,
          viewedProduct: viewedProductId,
          addedToCart: addedToCartId,
          activeOnSite: activeOnSiteId
        });

        // Step 3: Fetch event counts using Query Metric Aggregates endpoint
        // Build date filter for last 1 month
        const dateFilters = [
          `greater-or-equal(datetime,${startDate.toISOString()})`,
          `less-than(datetime,${endDate.toISOString()})`
        ];

        // Helper function to get event count using Query Metric Aggregates
        const getEventCountByMetricId = async (metricId) => {
          if (!metricId) return 0;
          
          try {
            const result = await this.queryMetricAggregates(metricId, {
              measurements: ['count'],
              filters: dateFilters,
              timezone: 'UTC'
            });
            
            return result.total || 0;
          } catch (error) {
            console.error(`Error getting event count for metric ${metricId}:`, error.message);
            return 0;
          }
        };

        // Get event counts for each metric using Query Metric Aggregates
        const [placedOrderCount, viewedProductCount, addedToCartCount, activeOnSiteCount] = await Promise.allSettled([
          placedOrderId ? getEventCountByMetricId(placedOrderId) : Promise.resolve(0),
          viewedProductId ? getEventCountByMetricId(viewedProductId) : Promise.resolve(0),
          addedToCartId ? getEventCountByMetricId(addedToCartId) : Promise.resolve(0),
          activeOnSiteId ? getEventCountByMetricId(activeOnSiteId) : Promise.resolve(0)
        ]);

        metrics.placedOrder = placedOrderCount.status === 'fulfilled' ? placedOrderCount.value : 0;
        metrics.viewedProduct = viewedProductCount.status === 'fulfilled' ? viewedProductCount.value : 0;
        metrics.addedToCart = addedToCartCount.status === 'fulfilled' ? addedToCartCount.value : 0;
        metrics.activeOnSite = activeOnSiteCount.status === 'fulfilled' ? activeOnSiteCount.value : 0;

        console.log('Event metrics calculated:', metrics);
      } catch (err) {
        console.error('Error fetching event metrics:', err.message);
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
      const profiles = await this.getProfiles({ 'page[size]': 20 });
      const lists = await this.getLists();

      const profileData = profiles?.data || [];
      const totalProfiles = profileData.length;
      
      let listMembership = 0;
      const listData = lists?.data || [];
      
      for (const list of listData) {
        try {
          const listId = list.id;
          if (listId) {
            const members = await this.makeRequest(`/lists/${listId}/profiles/`, 'GET', null, { 'page[size]': 20 });
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

  // Revenue Metrics
  async getRevenueMetrics() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);

      let totalRevenue = 0;
      const revenueBySource = {};
      let revenueOverTime = [];

      try {
        // Get all metrics to find Placed Order metric
        const allMetricsResponse = await this.getMetrics();
        const allMetrics = allMetricsResponse?.data || [];
        
        const findMetricId = (searchName) => {
          const metric = allMetrics.find(m => {
            const name = m?.attributes?.name || m?.name || '';
            return name.toLowerCase().includes(searchName.toLowerCase());
          });
          return metric?.id || null;
        };

        const placedOrderId = findMetricId('placed order');

        // Calculate revenue from Placed Order metric
        // Use the Query Metric Aggregates endpoint
        if (placedOrderId) {
          console.log('Calculating revenue from Placed Order events (last 12 months)...');
          const revenueData = await this.calculateRevenueByMetricId(placedOrderId, {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            interval: 'day', // Get daily breakdown
            timezone: 'UTC'
          });

          totalRevenue = revenueData.totalRevenue || 0;
          revenueOverTime = revenueData.revenueOverTime || [];

          console.log(`Total revenue calculated: $${totalRevenue.toFixed(2)}`);
        } else {
          console.warn('Placed Order metric not found, cannot calculate revenue');
        }
      } catch (err) {
        console.error('Error fetching revenue events:', err.message);
      }

      return {
        totalRevenue,
        revenueByEmailSource: revenueBySource,
        revenueOverTime: revenueOverTime
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

  // Get all metrics - Main method used by the API (Complex version)
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

  // Get simple metrics - Simplified version for quick overview
  async getSimpleMetrics() {
    try {
      // Fetch all complex metrics in parallel
      const [campaignMetrics, profileMetrics, revenueMetrics, campaigns, flows] = 
        await Promise.all([
          this.getCampaignMetrics(),
          this.getProfileMetrics(),
          this.getRevenueMetrics(),
          this.getCampaigns(),
          this.getFlows()
        ]);

      // Calculate simple metrics from complex ones
      const totalEmailsSent = campaignMetrics.delivered || 0;
      const activeSubscribers = profileMetrics.totalProfiles || 0;
      const revenueGenerated = revenueMetrics.totalRevenue || 0;
      
      // Calculate rates
      const openRate = campaignMetrics.delivered > 0
        ? ((campaignMetrics.opens / campaignMetrics.delivered) * 100).toFixed(2)
        : '0.00';
      
      // Click rate: clicks / delivered
      const clickRate = campaignMetrics.delivered > 0
        ? ((campaignMetrics.clicks / campaignMetrics.delivered) * 100).toFixed(2)
        : '0.00';
      
      // Conversion rate from flow metrics
      const flowMetrics = await this.getFlowMetrics();
      const conversionRateValue = parseFloat(flowMetrics.flowConversionRate.replace('%', '')) || 0;

      return {
        totalEmailsSent,
        activeSubscribers,
        revenueGenerated,
        openRate: `${openRate}%`,
        clickRate: `${clickRate}%`,
        conversionRate: `${conversionRateValue.toFixed(2)}%`
      };
    } catch (error) {
      console.error('Error fetching simple metrics:', error);
      return {
        totalEmailsSent: 0,
        activeSubscribers: 0,
        revenueGenerated: 0,
        openRate: '0%',
        clickRate: '0%',
        conversionRate: '0%'
      };
    }
  }
}
