import axios from 'axios';

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';

export class KlaviyoService {
  constructor(privateKey) {
    this.privateKey = privateKey;
    this.baseURL = KLAVIYO_API_BASE;
    this.lastRequestTime = 0;
    this.minRequestInterval = 500; // 500ms between requests = max 2 requests per second (more conservative)
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
    const maxRetries = 5; // Increased retries for throttling
    
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
        // Use paramsSerializer to preserve bracket notation (e.g., page[size])
        // Axios by default might convert brackets, so we need a custom serializer
        config.params = params;
        config.paramsSerializer = (params) => {
          const parts = [];
          for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
              // Encode the key and value, preserving brackets in the key
              parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
            }
          }
          return parts.join('&');
        };
      } else if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      // Handle 429 throttling errors with retry
      if (error.response?.status === 429 && retryCount < maxRetries) {
        // Extract wait time from error message
        const errorDetail = error.response?.data?.errors?.[0]?.detail || '';
        const retryAfter = errorDetail.match(/(\d+)\s*second/i);
        // Use extracted time + 500ms buffer, or default to 2 seconds
        const waitTime = retryAfter ? (parseInt(retryAfter[1]) * 1000 + 500) : 2000;
        
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
      // Note: Datetime values should NOT be in quotes per Klaviyo API requirements
      if (!filters || filters.length === 0) {
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        filters = [
          `greater-or-equal(datetime,${oneYearAgo.toISOString()})`,
          `less-than(datetime,${now.toISOString()})`
        ];
      }
      // Process filters to ensure datetime values are not quoted
      // Klaviyo API requires datetime values without quotes: datetime,2025-01-15T14:05:00.000Z
      // NOT: datetime,"2025-01-15T14:05:00.000Z"
      const processedFilters = filters.map(filter => {
        // Remove quotes from datetime ISO strings if present
        // Pattern: datetime,"2025-01-15T14:05:00.000Z" -> datetime,2025-01-15T14:05:00.000Z
        let processed = filter.replace(/datetime,"([^"]+)"/g, 'datetime,$1');
        // Also handle cases where the entire datetime value might be quoted
        processed = processed.replace(/datetime,(".*?")/g, (match, quoted) => {
          return `datetime,${quoted.replace(/"/g, '')}`;
        });
        return processed;
      });
      requestBody.data.attributes.filter = processedFilters;

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
      // Process sequentially to avoid rate limiting
      let opensData = { total: 0, grouped: {} };
      let clicksData = { total: 0, grouped: {} };
      let deliveredData = { total: 0, grouped: {} };
      let bouncesData = { total: 0, grouped: {} };
      let revenueData = { total: 0, grouped: {} };

      // Get unique opens (grouped by campaign)
      // Per documentation: Use "Opened Email" metric with "unique" measurement
      if (openedEmailId) {
        try {
          opensData = await this.queryMetricAggregates(openedEmailId, {
            measurements: ['unique'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          });
          await this.wait(500);
        } catch (err) {
          console.error('Error getting opens:', err.message);
        }
      }

      // Get unique clicks (grouped by campaign)
      // Per documentation: Use "Clicked Email" metric with "unique" measurement
      if (clickedEmailId) {
        try {
          clicksData = await this.queryMetricAggregates(clickedEmailId, {
            measurements: ['unique'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          });
          await this.wait(500);
        } catch (err) {
          console.error('Error getting clicks:', err.message);
        }
      }

      // Get total delivered/received (grouped by campaign)
      // Per documentation: Use "Received Email" metric with "count" measurement
      if (receivedEmailId) {
        try {
          deliveredData = await this.queryMetricAggregates(receivedEmailId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          });
          await this.wait(500);
        } catch (err) {
          console.error('Error getting delivered:', err.message);
        }
      }

      // Get bounces (grouped by campaign)
      if (bouncedEmailId) {
        try {
          bouncesData = await this.queryMetricAggregates(bouncedEmailId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          });
          await this.wait(500);
        } catch (err) {
          console.error('Error getting bounces:', err.message);
        }
      }

      // Get revenue (grouped by campaign)
      // Per documentation: Use "Placed Order" metric with "sum_value" measurement
      if (placedOrderId) {
        try {
          revenueData = await this.queryMetricAggregates(placedOrderId, {
            measurements: ['sum_value'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by campaign
            timezone: timezone
          });
        } catch (err) {
          console.error('Error getting revenue:', err.message);
        }
      }

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
        startDate = null,
        endDate = null,
        timezone = "UTC"
      } = options;

      // Flow metrics need date filters (required by API)
      // Use provided dates or default to last 1 year
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      
      const baseFilters = [];
      if (startDate && endDate) {
        // Remove quotes if present in the date strings
        const cleanStartDate = startDate.replace(/^"|"$/g, '');
        const cleanEndDate = endDate.replace(/^"|"$/g, '');
        baseFilters.push(`greater-or-equal(datetime,${cleanStartDate})`);
        baseFilters.push(`less-than(datetime,${cleanEndDate})`);
      } else {
        baseFilters.push(`greater-or-equal(datetime,${oneYearAgo.toISOString()})`);
        baseFilters.push(`less-than(datetime,${now.toISOString()})`);
      }

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
      // Process sequentially to avoid rate limiting
      let sendsData = { total: 0, grouped: {} };
      let conversionsData = { total: 0, grouped: {} };
      let revenueData = { total: 0, grouped: {} };

      // Get flow sends (Received Email count, grouped by flow)
      if (receivedEmailId) {
        try {
          sendsData = await this.queryMetricAggregates(receivedEmailId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by flow
            timezone: timezone
          });
          await this.wait(500);
        } catch (err) {
          console.error('Error getting flow sends:', err.message);
        }
      }

      // Get flow conversions (Placed Order count, grouped by flow)
      if (placedOrderId) {
        try {
          conversionsData = await this.queryMetricAggregates(placedOrderId, {
            measurements: ['count'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by flow
            timezone: timezone
          });
          await this.wait(500);
        } catch (err) {
          console.error('Error getting flow conversions:', err.message);
        }
      }

      // Get flow revenue (Placed Order sum_value, grouped by flow)
      if (placedOrderId) {
        try {
          revenueData = await this.queryMetricAggregates(placedOrderId, {
            measurements: ['sum_value'],
            filters: baseFilters,
            by: ['$attributed_message'], // Group by flow
            timezone: timezone
          });
        } catch (err) {
          console.error('Error getting flow revenue:', err.message);
        }
      }

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
      
      // Remove quotes if present in date strings
      const cleanStartDate = (startDate || oneMonthAgo.toISOString()).replace(/^"|"$/g, '');
      const cleanEndDate = (endDate || now.toISOString()).replace(/^"|"$/g, '');
      
      // Date filters are always required - datetime values should NOT be in quotes
      filters.push(`greater-or-equal(datetime,${cleanStartDate})`);
      filters.push(`less-than(datetime,${cleanEndDate})`);
      
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
        // Process sequentially to avoid rate limiting
        if (placedOrderId) {
          try {
            metrics.placedOrder = await getEventCountByMetricId(placedOrderId);
            await this.wait(500);
          } catch (err) {
            console.error('Error getting placed order count:', err.message);
          }
        }
        
        if (viewedProductId) {
          try {
            metrics.viewedProduct = await getEventCountByMetricId(viewedProductId);
            await this.wait(500);
          } catch (err) {
            console.error('Error getting viewed product count:', err.message);
          }
        }
        
        if (addedToCartId) {
          try {
            metrics.addedToCart = await getEventCountByMetricId(addedToCartId);
            await this.wait(500);
          } catch (err) {
            console.error('Error getting added to cart count:', err.message);
          }
        }
        
        if (activeOnSiteId) {
          try {
            metrics.activeOnSite = await getEventCountByMetricId(activeOnSiteId);
          } catch (err) {
            console.error('Error getting active on site count:', err.message);
          }
        }

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

  // Get flow revenue for last month using $attributed_flow
  // Per Klaviyo documentation: https://developers.klaviyo.com/en/docs/using_the_query_metric_aggregates_endpoint#flow-revenue-performance-reporting
  async getFlowRevenueLastMonth() {
    try {
      // Last 1 month (30 days) date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

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

      if (!placedOrderId) {
        console.warn('Placed Order metric not found, cannot calculate flow revenue');
        return 0;
      }

      // Build date filters for last 30 days
      const dateFilters = [
        `greater-or-equal(datetime,${startDate.toISOString()})`,
        `less-than(datetime,${endDate.toISOString()})`,
        `not(equals($attributed_flow, ""))` // Only include flow-attributed revenue
      ];

      console.log('Calculating flow revenue (last 30 days) using $attributed_flow...');
      
      // Query metric aggregates grouped by $attributed_flow
      const revenueResult = await this.queryMetricAggregates(placedOrderId, {
        measurements: ['sum_value'],
        filters: dateFilters,
        by: ['$attributed_flow'], // Group by flow (not message)
        timezone: 'UTC'
      });

      const totalFlowRevenue = revenueResult.total || 0;
      console.log(`Total flow revenue (last 30 days): $${totalFlowRevenue.toFixed(2)}`);

      return totalFlowRevenue;
    } catch (error) {
      console.error('Error calculating flow revenue:', error.message);
      return 0;
    }
  }

  // Revenue Metrics - Last 30 days, only email-attributed revenue
  async getRevenueMetrics() {
    try {
      // Last 30 days date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      let totalRevenue = 0;
      const revenueByCampaigns = {};
      const revenueByFlows = {};
      let flowRevenueLastMonth = 0; // Add flow revenue for last month
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

        if (!placedOrderId) {
          console.warn('Placed Order metric not found, cannot calculate revenue');
          return {
            totalRevenue: 0,
            revenueByCampaigns: {},
            revenueByFlows: {},
            revenueByEmailSource: {},
            revenueOverTime: []
          };
        }

        // Build date filters for last 30 days
        const dateFilters = [
          `greater-or-equal(datetime,${startDate.toISOString()})`,
          `less-than(datetime,${endDate.toISOString()})`
        ];

        // Get revenue grouped by $attributed_message (campaigns and flows)
        // This will only include revenue that is attributed to email messages
        console.log('Calculating email-attributed revenue (last 30 days)...');
        
        const revenueResult = await this.queryMetricAggregates(placedOrderId, {
          measurements: ['sum_value'],
          filters: dateFilters,
          by: ['$attributed_message'], // Group by campaign/flow message
          timezone: 'UTC'
        });

        // Get campaign and flow metrics with grouped data to identify message IDs
        // We'll use the existing grouped revenue data from campaign and flow metrics
        const [campaignMetricsResult, flowMetricsResult] = await Promise.allSettled([
          this.getCampaignMetrics({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }),
          this.getFlowMetrics({ startDate: startDate.toISOString(), endDate: endDate.toISOString() })
        ]);

        const campaignMetrics = campaignMetricsResult.status === 'fulfilled' ? campaignMetricsResult.value : { grouped: {} };
        const flowMetrics = flowMetricsResult.status === 'fulfilled' ? flowMetricsResult.value : { grouped: {} };

        // Get campaign and flow names for message IDs
        const [campaignsResponse, flowsResponse] = await Promise.allSettled([
          this.getCampaigns(),
          this.getFlows()
        ]);

        const campaigns = campaignsResponse.status === 'fulfilled' ? campaignsResponse.value : { data: [] };
        const flows = flowsResponse.status === 'fulfilled' ? flowsResponse.value : { data: [] };

        // Build a map of message ID to campaign/flow name
        const messageToCampaignName = {};
        const messageToFlowName = {};

        // Map campaign message IDs to campaign names
        // Use the filter approach: GET /campaign-messages/?filter=equals(campaign_id,"...")
        // Note: No page[size] parameter - Klaviyo returns default page size automatically
        if (campaigns?.data && campaigns.data.length > 0) {
          for (const campaign of campaigns.data.slice(0, 20)) { // Limit to avoid too many API calls
            try {
              const campaignId = campaign.id;
              const campaignName = campaign.attributes?.name || `Campaign ${campaignId.substring(0, 8)}`;
              
              // Use filter approach instead of nested endpoint
              const messagesResponse = await this.makeRequest(
                '/campaign-messages/',
                'GET',
                null,
                { 
                  'filter': `equals(campaign_id,"${campaignId}")`
                  // No page[size] - Klaviyo handles pagination automatically
                }
              );
              if (messagesResponse?.data) {
                messagesResponse.data.forEach(msg => {
                  if (msg.id) messageToCampaignName[msg.id] = campaignName;
                });
              }
              await this.wait(500); // Rate limiting
            } catch (err) {
              console.error(`Error fetching messages for campaign ${campaign.id}:`, err.message);
            }
          }
        }

        // Map flow action IDs to flow names
        if (flows?.data && flows.data.length > 0) {
          for (const flow of flows.data.slice(0, 20)) { // Limit to avoid too many API calls
            try {
              const flowId = flow.id;
              const flowName = flow.attributes?.name || `Flow ${flowId.substring(0, 8)}`;
              const actionsResponse = await this.makeRequest(
                `/flows/${flowId}/flow-actions/`,
                'GET',
                null,
                { 'page[size]': 50 }
              );
              if (actionsResponse?.data) {
                actionsResponse.data.forEach(action => {
                  if (action.id) messageToFlowName[action.id] = flowName;
                });
              }
              await this.wait(500); // Rate limiting
            } catch (err) {
              console.error(`Error fetching actions for flow ${flow.id}:`, err.message);
            }
          }
        }

        // Process grouped revenue data
        const groupedRevenue = revenueResult.grouped || {};
        
        for (const [messageId, revenue] of Object.entries(groupedRevenue)) {
          const revenueValue = parseFloat(revenue) || 0;
          if (revenueValue > 0) {
            totalRevenue += revenueValue;

            // Determine if this is a campaign or flow based on our maps
            if (messageToCampaignName[messageId]) {
              const campaignName = messageToCampaignName[messageId];
              revenueByCampaigns[campaignName] = (revenueByCampaigns[campaignName] || 0) + revenueValue;
            } else if (messageToFlowName[messageId]) {
              const flowName = messageToFlowName[messageId];
              revenueByFlows[flowName] = (revenueByFlows[flowName] || 0) + revenueValue;
            } else {
              // If we can't identify it, check if it appears in campaign or flow grouped data
              if (campaignMetrics.grouped?.revenue?.[messageId]) {
                revenueByCampaigns[`Campaign ${messageId.substring(0, 8)}`] = (revenueByCampaigns[`Campaign ${messageId.substring(0, 8)}`] || 0) + revenueValue;
              } else if (flowMetrics.grouped?.revenue?.[messageId]) {
                revenueByFlows[`Flow ${messageId.substring(0, 8)}`] = (revenueByFlows[`Flow ${messageId.substring(0, 8)}`] || 0) + revenueValue;
              }
            }
          }
        }

        // Get revenue over time (daily breakdown) - only email-attributed
        const revenueOverTimeResult = await this.queryMetricAggregates(placedOrderId, {
          measurements: ['sum_value'],
          filters: [
            ...dateFilters,
            // Only include revenue with $attributed_message (email-attributed)
            `greater-than($attributed_message,"")`
          ],
          interval: 'day',
          timezone: 'UTC'
        });

        // Process revenue over time from the response
        // Note: The API response structure for interval data may differ
        // For now, we'll use the total and create a simple breakdown
        if (revenueOverTimeResult.total > 0) {
          // If we have interval data, it would be in the response structure
          // For simplicity, we'll return an empty array and let the frontend handle it
          revenueOverTime = [];
        }

        // Get flow revenue for last month using $attributed_flow
        flowRevenueLastMonth = await this.getFlowRevenueLastMonth();

        console.log(`Total email-attributed revenue (last 30 days): $${totalRevenue.toFixed(2)}`);
        console.log(`Flow revenue (last month): $${flowRevenueLastMonth.toFixed(2)}`);
        console.log(`Revenue by campaigns:`, Object.keys(revenueByCampaigns).length, 'campaigns');
        console.log(`Revenue by flows:`, Object.keys(revenueByFlows).length, 'flows');

      } catch (err) {
        console.error('Error fetching revenue events:', err.message);
      }

      return {
        totalRevenue,
        revenueByCampaigns,
        revenueByFlows,
        flowRevenueLastMonth, // Flow revenue for last month using $attributed_flow
        revenueByEmailSource: { ...revenueByCampaigns, ...revenueByFlows }, // For backward compatibility
        revenueOverTime: revenueOverTime
      };
    } catch (error) {
      console.error('Error fetching revenue metrics:', error);
      return {
        totalRevenue: 0,
        revenueByCampaigns: {},
        revenueByFlows: {},
        flowRevenueLastMonth: 0,
        revenueByEmailSource: {},
        revenueOverTime: []
      };
    }
  }

  // Get all metrics - Main method used by the API (Complex version)
  // Use sequential processing to avoid rate limiting
  // All revenue-related metrics use a consistent 30-day window
  async getAllMetrics() {
    try {
      // Define consistent date range for all revenue metrics (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const dateRange = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };

      // Process metrics sequentially to avoid overwhelming the API
      // Start with simpler/faster endpoints first
      console.log('Fetching profile metrics...');
      const profileMetrics = await this.getProfileMetrics();
      await this.wait(500); // Wait between calls
      
      console.log('Fetching event metrics...');
      const eventMetrics = await this.getEventMetrics();
      await this.wait(500);
      
      console.log('Fetching campaign metrics (last 30 days)...');
      const campaignMetrics = await this.getCampaignMetrics(dateRange);
      await this.wait(500);
      
      console.log('Fetching flow metrics (last 30 days)...');
      const flowMetrics = await this.getFlowMetrics(dateRange);
      await this.wait(500);
      
      console.log('Fetching revenue metrics (last 30 days)...');
      const revenueMetrics = await this.getRevenueMetrics();

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
