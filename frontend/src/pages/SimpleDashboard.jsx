import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './SimpleDashboard.css';

const SimpleDashboard = () => {
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
      const response = await api.get('/metrics/simple');
      setMetrics(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load metrics. Please try again later.');
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="simple-dashboard-container">
        <div className="loading">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="simple-dashboard-container">
        <div className="error">
          {error}
          <button onClick={fetchMetrics} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="simple-dashboard-container">
      <div className="simple-dashboard-header">
        <h1>Klaviyo Metrics</h1>
        <div className="header-actions">
          <button 
            onClick={() => navigate('/dashboard')} 
            className="view-toggle-button"
            title="Switch to detailed view"
          >
            📋 Detailed View
          </button>
          <button onClick={fetchMetrics} className="refresh-button">Refresh</button>
          <button onClick={logout} className="logout-button">Logout</button>
        </div>
      </div>

      <div className="simple-metrics-grid">
        <div className="simple-metric-card">
          <div className="metric-icon email-icon">✉️</div>
          <div className="metric-content">
            <h3>Total Emails Sent</h3>
            <p className="metric-value">{metrics?.totalEmailsSent || 0}</p>
          </div>
        </div>

        <div className="simple-metric-card">
          <div className="metric-icon subscriber-icon">👥</div>
          <div className="metric-content">
            <h3>Active Subscribers</h3>
            <p className="metric-value">{metrics?.activeSubscribers || 0}</p>
          </div>
        </div>

        <div className="simple-metric-card">
          <div className="metric-icon revenue-icon">$</div>
          <div className="metric-content">
            <h3>Revenue Generated</h3>
            <p className="metric-value">
              ${(metrics?.revenueGenerated || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </p>
          </div>
        </div>

        <div className="simple-metric-card">
          <div className="metric-icon chart-icon">📈</div>
          <div className="metric-content">
            <h3>Open Rate</h3>
            <p className="metric-value">{metrics?.openRate || '0%'}</p>
          </div>
        </div>

        <div className="simple-metric-card">
          <div className="metric-icon target-icon">🎯</div>
          <div className="metric-content">
            <h3>Click Rate</h3>
            <p className="metric-value">{metrics?.clickRate || '0%'}</p>
          </div>
        </div>

        <div className="simple-metric-card">
          <div className="metric-icon cart-icon">🛒</div>
          <div className="metric-content">
            <h3>Conversion Rate</h3>
            <p className="metric-value">{metrics?.conversionRate || '0%'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleDashboard;

