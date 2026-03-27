import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

export const forgotPassword = async (email) => {
  const response = await api.post('/forgot-password', { email });
  return response.data;
};

export const resetPassword = async (token, password) => {
  const response = await api.post('/reset-password', { token, password });
  return response.data;
};