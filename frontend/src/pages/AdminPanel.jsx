import { useState, useEffect } from 'react';
import api from '../services/api';
import './AdminPanel.css';

const AdminPanel = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    klaviyo_private_key: ''
  });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const response = await api.get('/admin/clients');
      setClients(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load clients. ' + (err.response?.data?.error || err.message));
      console.error('Error fetching clients:', err);
    } finally {
      setLoadingClients(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await api.post('/admin/clients', formData);
      setSuccess(response.data.message || 'Client added successfully!');
      setFormData({
        name: '',
        email: '',
        password: '',
        klaviyo_private_key: ''
      });
      // Refresh clients list
      await fetchClients();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add client. Please try again.');
      console.error('Error adding client:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-panel-container">
      <div className="admin-panel">
        <div className="admin-header">
          <div>
            <h1>Admin Panel</h1>
            <p className="subtitle">Add and manage clients</p>
          </div>
          <a href="/login" className="back-link">← Back to Login</a>
        </div>

        {/* Add Client Form */}
        <div className="form-section">
          <h2>Add New Client</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Client Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Enter client name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="Enter client email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Enter client password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="klaviyo_private_key">Klaviyo Private Key</label>
              <input
                type="text"
                id="klaviyo_private_key"
                name="klaviyo_private_key"
                value={formData.klaviyo_private_key}
                onChange={handleChange}
                required
                placeholder="Enter Klaviyo private key (pk_xxxxx)"
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Adding Client...' : 'Add Client'}
            </button>
          </form>
        </div>

        {/* Clients List */}
        <div className="clients-section">
          <h2>Existing Clients</h2>
          {loadingClients ? (
            <div className="loading">Loading clients...</div>
          ) : clients.length === 0 ? (
            <div className="no-clients">No clients added yet.</div>
          ) : (
            <div className="clients-list">
              {clients.map((client) => (
                <div key={client.id} className="client-card">
                  <div className="client-info">
                    <h3>{client.name}</h3>
                    <p className="client-email">{client.email}</p>
                    <p className="client-date">
                      Added: {new Date(client.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;

