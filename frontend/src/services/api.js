import axios from 'axios';

// In development, use proxy. In production, use full URL from env
const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // In development, use relative path to leverage Vite proxy
  if (import.meta.env.DEV) {
    return '/api';
  }
  // Fallback for production
  return 'http://localhost:3001/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // If token is invalid or expired (401/403), clear auth and redirect to login
    if (error.response?.status === 401 || error.response?.status === 403) {
      const errorMessage = error.response?.data?.error || '';
      if (errorMessage.toLowerCase().includes('token') || 
          errorMessage.toLowerCase().includes('expired') ||
          errorMessage.toLowerCase().includes('invalid')) {
        // Clear stored auth data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
        
        // Only redirect if not already on login page
        if (window.location.pathname !== '/login' && window.location.pathname !== '/admin') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

