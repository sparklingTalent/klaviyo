import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/metrics/all');
      setMetrics(response.data);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          err.message || 
                          'Failed to load metrics. Please try again later.';
      setError(errorMessage);
      console.error('Error fetching metrics:', err);
      console.error('Error response:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    // Check if error is about token expiration
    const isTokenError = error.toLowerCase().includes('token') || 
                        error.toLowerCase().includes('expired') ||
                        error.toLowerCase().includes('invalid');
    
    return (
      <div className="dashboard-container">
        <div className="error">
          {error}
          {isTokenError ? (
            <div style={{ marginTop: '1rem' }}>
              <p>Your session has expired. Please log in again.</p>
              <button 
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  window.location.href = '/login';
                }} 
                className="retry-button"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <button onClick={fetchMetrics} className="retry-button">Retry</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Klaviyo Metrics Dashboard</h1>
        <div className="header-actions">
          <button 
            onClick={() => navigate('/dashboard/simple')} 
            className="view-toggle-button"
            title="Switch to simple view"
          >
            📊 Simple View
          </button>
          <button onClick={fetchMetrics} className="refresh-button" title="Refresh metrics">
            🔄 Refresh
          </button>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {/* Overview Section */}
        <div className="section">
          <h2 className="section-title">Overview</h2>
          <div className="overview-grid">
            <div className="metric-card purple-gradient">
              <h3 className="metric-title">Total Campaigns</h3>
              <p className="metric-value white">{metrics?.overview?.totalCampaigns || 0}</p>
            </div>
            <div className="metric-card white-bg">
              <h3 className="metric-title">Total Flows</h3>
              <p className="metric-value">{metrics?.overview?.totalFlows || 0}</p>
            </div>
            <div className="metric-card white-bg">
              <h3 className="metric-title">Total Revenue</h3>
              <p className="metric-value">{formatCurrency(metrics?.overview?.totalRevenue || 0)}</p>
            </div>
          </div>
        </div>

        {/* Event Metrics Section */}
        <div className="section">
          <h2 className="section-title">Event Metrics</h2>
          <div className="event-metrics-grid">
            <div className="metric-card purple-gradient">
              <h3 className="metric-title">Placed Order</h3>
              <p className="metric-value white">{metrics?.event?.placedOrder || 0}</p>
            </div>
            <div className="metric-card white-bg">
              <h3 className="metric-title">Viewed Product</h3>
              <p className="metric-value">{(metrics?.event?.viewedProduct || 0).toLocaleString()}</p>
            </div>
            <div className="metric-card white-bg">
              <h3 className="metric-title">Added to Cart</h3>
              <p className="metric-value">{metrics?.event?.addedToCart || 0}</p>
            </div>
            <div className="metric-card white-bg">
              <h3 className="metric-title">Active on Site</h3>
              <p className="metric-value">{(metrics?.event?.activeOnSite || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="section">
          <div className="last-updated-card">
            <span className="last-updated-label">Last Updated:</span>
            <span className="last-updated-time">{formatDate(metrics?.lastUpdated)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
