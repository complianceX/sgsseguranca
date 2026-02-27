import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
});

// 🚨 CRITICAL SECURITY WARNING 🚨
// Storing JWTs in localStorage makes the application vulnerable to XSS attacks.
// If an attacker can inject any JavaScript into the page, they can steal the user's token.
// The BEST PRACTICE is to use httpOnly cookies for storing tokens. This requires a backend change
// to set the cookie upon login. The frontend would then not need to handle the token manually.
// This interceptor centralizes the insecure pattern, making it easier to replace later.
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

// Global error handler for API responses
api.interceptors.response.use(
  (response) => {
    // Any status code that lie within the range of 2xx cause this function to trigger
    return response;
  },
  (error) => {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // You can add global error logging here (e.g., to Sentry)
    console.error('API Error:', error.response?.data || error.message);

    // We re-throw the error so that the component calling the service can handle it
    // and show an appropriate UI message.
    return Promise.reject(error);
  }
);

export default api;
