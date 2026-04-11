// API utility functions for communicating with the Express backend

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

function buildApiUrl(endpoint: string) {
  return API_BASE ? `${API_BASE}${endpoint}` : endpoint;
}

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const url = buildApiUrl(endpoint);
  
  const defaultOptions: RequestInit = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, defaultOptions);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || error.error || 'API request failed');
  }

  return response.json();
}

// Auth endpoints
export const authAPI = {
  register: (data: { fullname: string; email: string; password: string; college?: string }) =>
    fetchAPI('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  login: (data: { email: string; password: string }) =>
    fetchAPI('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  logout: () =>
    fetchAPI('/api/logout', {
      method: 'POST',
    }),
  
  me: () =>
    fetchAPI('/api/auth/me'),
  
  getConfig: () =>
    fetchAPI('/api/config'),
};

// Auction endpoints
export const auctionAPI = {
  getAll: () =>
    fetchAPI('/api/auctions'),
  
  getById: (id: string) =>
    fetchAPI(`/api/auction/${id}`),
  
  getClosed: () =>
    fetchAPI('/api/auctions/closed'),
  
  create: (formData: FormData) =>
    fetch(buildApiUrl('/api/sell'), {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).then(res => {
      if (!res.ok) throw new Error('Failed to create auction');
      return res.json();
    }),
};

// Bid endpoints
export const bidAPI = {
  placeBid: (listingId: string, bidAmount: number) =>
    fetchAPI(`/api/bids/${listingId}`, {
      method: 'POST',
      body: JSON.stringify({ bidAmount }),
    }),
  
  setAutoBid: (listingId: string, maxAmount: number) =>
    fetchAPI('/api/bids/auto-bid', {
      method: 'POST',
      body: JSON.stringify({ listingId, maxAmount }),
    }),
};

// User endpoints
export const userAPI = {
  deposit: (amount: number) =>
    fetchAPI('/api/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
};

// Admin endpoints
export const adminAPI = {
  getUsers: () =>
    fetchAPI('/api/admin/users'),
  
  getLogs: () =>
    fetchAPI('/api/admin/logs'),
  
  deleteUser: (id: string) =>
    fetchAPI(`/api/admin/users/${id}`, {
      method: 'DELETE',
    }),
  
  deleteAuction: (id: string) =>
    fetchAPI(`/api/admin/auctions/${id}`, {
      method: 'DELETE',
    }),
};

// Analytics
export const analyticsAPI = {
  getStats: () =>
    fetchAPI('/api/analytics'),
};
