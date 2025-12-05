import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import MetricCard from '../components/MetricCard';
import MetricSection from '../components/MetricSection';
import RevenueChart from '../components/RevenueChart';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/metrics/all');
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
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div>
            <h1>Klaviyo Metrics Dashboard</h1>
            <p>Welcome back, {user?.name}</p>
          </div>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </header>
        <div className="dashboard-content">
          <div className="loading">
            Loading metrics...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div>
            <h1>Klaviyo Metrics Dashboard</h1>
            <p>Welcome back, {user?.name}</p>
          </div>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </header>
        <div className="dashboard-content">
          <div className="error">
            <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>⚠️</div>
            {error}
          </div>
          <button onClick={fetchMetrics} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1>Klaviyo Metrics Dashboard</h1>
          <p>Welcome back, {user?.name}</p>
        </div>
        <div className="header-actions">
          <button onClick={fetchMetrics} className="refresh-button" title="Refresh metrics">
            🔄 Refresh
          </button>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Campaign Metrics */}
        <MetricSection title="Campaign Metrics">
          <div className="metrics-grid">
            <MetricCard
              title="Opens"
              value={metrics?.campaign?.opens || 0}
              format="number"
            />
            <MetricCard
              title="Click-through Rate"
              value={metrics?.campaign?.clickThroughRate || '0%'}
            />
            <MetricCard
              title="Delivered"
              value={metrics?.campaign?.delivered || 0}
              format="number"
            />
            <MetricCard
              title="Bounces"
              value={metrics?.campaign?.bounces || 0}
              format="number"
            />
            <MetricCard
              title="Revenue"
              value={metrics?.campaign?.revenue || 0}
              format="currency"
            />
          </div>
        </MetricSection>

        {/* Flow Metrics */}
        <MetricSection title="Flow Metrics">
          <div className="metrics-grid">
            <MetricCard
              title="Flow Conversion Rate"
              value={metrics?.flow?.flowConversionRate || '0%'}
            />
            <MetricCard
              title="Flow Sends"
              value={metrics?.flow?.flowSends || 0}
              format="number"
            />
            <MetricCard
              title="Flow Revenue"
              value={metrics?.flow?.flowRevenue || 0}
              format="currency"
            />
          </div>
        </MetricSection>

        {/* Event Metrics */}
        <MetricSection title="Event Metrics">
          <div className="metrics-grid">
            <MetricCard
              title="Placed Order"
              value={metrics?.event?.placedOrder || 0}
              format="number"
            />
            <MetricCard
              title="Viewed Product"
              value={metrics?.event?.viewedProduct || 0}
              format="number"
            />
            <MetricCard
              title="Added to Cart"
              value={metrics?.event?.addedToCart || 0}
              format="number"
            />
            <MetricCard
              title="Active on Site"
              value={metrics?.event?.activeOnSite || 0}
              format="number"
            />
          </div>
        </MetricSection>

        {/* Profile Metrics */}
        <MetricSection title="Profile Metrics">
          <div className="metrics-grid">
            <MetricCard
              title="Total Profiles"
              value={metrics?.profile?.totalProfiles || 0}
              format="number"
            />
            <MetricCard
              title="List Membership"
              value={metrics?.profile?.listMembership || 0}
              format="number"
            />
            <MetricCard
              title="List Growth"
              value={metrics?.profile?.listGrowth || '0%'}
            />
          </div>
        </MetricSection>

        {/* Revenue Metrics */}
        <MetricSection title="Revenue Metrics">
          <div className="metrics-grid">
            <MetricCard
              title="Total Revenue"
              value={metrics?.revenue?.totalRevenue || 0}
              format="currency"
            />
          </div>
          
          {metrics?.revenue?.revenueOverTime && 
           metrics.revenue.revenueOverTime.length > 0 && (
            <div className="chart-container">
              <RevenueChart data={metrics.revenue.revenueOverTime} />
            </div>
          )}

          {metrics?.revenue?.revenueByEmailSource && 
           Object.keys(metrics.revenue.revenueByEmailSource).length > 0 && (
            <div className="revenue-source">
              <h3>Revenue by Email Source</h3>
              <div className="source-list">
                {Object.entries(metrics.revenue.revenueByEmailSource).map(([source, revenue]) => (
                  <div key={source} className="source-item">
                    <span className="source-name">{source}</span>
                    <span className="source-revenue">
                      ${parseFloat(revenue).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </MetricSection>
      </div>
    </div>
  );
};

export default Dashboard;

