import axios from 'axios';

const baseURL = import.meta.env.VITE_BACKEND_URL || '';

const apiClient = axios.create({
  baseURL,
  timeout: 360000,
});

export default apiClient;
