import axios from 'axios';

// Current server base URL (will be set dynamically)
let currentServerUrl = null;

// Helper to ensure URL has protocol
const normalizeServerUrl = (url) => {
  if (!url) return url;
  // If URL doesn't start with http:// or https://, add http://
  if (!url.match(/^https?:\/\//i)) {
    return `http://${url}`;
  }
  return url;
};

// Create axios instance with dynamic base URL
const createApiInstance = (serverUrl) => {
  // Normalize URL to ensure protocol is present
  const normalizedUrl = normalizeServerUrl(serverUrl);
  // Support relative URLs (empty string or null) for nginx proxy
  // When serverUrl is empty/null, use '/api' for same-origin requests
  const apiPath = serverUrl === '' ? '/api' : (normalizedUrl ? `${normalizedUrl}/api` : null);

  if (apiPath === null) {
    return null;
  }

  const instance = axios.create({
    baseURL: apiPath,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add request interceptor to include auth token
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Add response interceptor to handle 401 errors
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        // Clear auth data on 401 (let components handle the redirect)
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        localStorage.removeItem('currentServer');
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

// Initialize with stored server or null
const initializeApi = () => {
  const storedServer = localStorage.getItem('currentServer');
  if (storedServer) {
    try {
      const server = JSON.parse(storedServer);
      currentServerUrl = server.url;
    } catch (error) {
      console.error('Failed to parse stored server:', error);
    }
  }
};

initializeApi();

// API instance (created lazily)
let api = createApiInstance(currentServerUrl);

// Function to update the server URL
export const setServerUrl = (serverUrl) => {
  currentServerUrl = serverUrl;
  api = createApiInstance(serverUrl);
};

// Function to get the current API instance
const getApi = () => {
  if (!api) {
    throw new Error('No server selected. Please select a server to connect to.');
  }
  return api;
};

// Cameras API
export const camerasAPI = {
  getAll: async (enabledOnly = false) => {
    const response = await getApi().get('/cameras', { params: { enabled: enabledOnly } });
    return response.data;
  },

  getById: async (id) => {
    const response = await getApi().get(`/cameras/${id}`);
    return response.data;
  },

  getSnapshot: async (serialNumber) => {
    const response = await getApi().get(`/cameras/${serialNumber}/snapshot`);
    return response.data;
  },

  update: async (id, data) => {
    const response = await getApi().put(`/cameras/${id}`, data);
    return response.data;
  },
};

// Path Events API
export const pathsAPI = {
  query: async (filters) => {
    // Build MongoDB query object from frontend filters
    const mongoQuery = {};
    const options = {
      sort: { timestamp: -1 },
    };

    // REQUIRED: serial (camera serial number)
    if (filters.serial) {
      mongoQuery.serial = filters.serial;
    }

    // REQUIRED: timestamp range (from/to converted to $gte/$lte)
    // Timestamps are stored as EPOCH milliseconds in the database
    if (filters.from || filters.to) {
      mongoQuery.timestamp = {};
      if (filters.from) {
        mongoQuery.timestamp.$gte = new Date(filters.from).getTime();
      }
      if (filters.to) {
        mongoQuery.timestamp.$lte = new Date(filters.to).getTime();
      }
    }

    // OPTIONAL: class (exact match, null/empty means all)
    if (filters.class) {
      mongoQuery.class = filters.class;
    }

    // OPTIONAL: minDwell (dwell >= minDwell) — kept for backward compat
    if (filters.minDwell !== undefined && filters.minDwell !== null && filters.minDwell !== '') {
      mongoQuery.dwell = { $gte: parseFloat(filters.minDwell) };
    }

    // OPTIONAL: minIdle (maxIdle >= minIdle) — filters paths where object was stationary
    if (filters.minIdle !== undefined && filters.minIdle !== null && filters.minIdle !== '') {
      mongoQuery.maxIdle = { $gte: parseFloat(filters.minIdle) };
    }

    // OPTIONAL: minAge (age >= minAge)
    if (filters.minAge !== undefined && filters.minAge !== null && filters.minAge !== '') {
      mongoQuery.age = { $gte: parseFloat(filters.minAge) };
    }

    // OPTIONAL: direction filters (dy/dx)
    // dy < 0 means object moved up in the frame
    if (filters.dy !== undefined && filters.dy !== null) {
      if (filters.dy === 'up') {
        mongoQuery.dy = { $lt: 0 };
      } else if (filters.dy === 'down') {
        mongoQuery.dy = { $gte: 0 };
      } else if (typeof filters.dy === 'object') {
        mongoQuery.dy = filters.dy; // Allow direct operator objects
      }
    }

    // dx < 0 means object moved left in the frame
    if (filters.dx !== undefined && filters.dx !== null) {
      if (filters.dx === 'left') {
        mongoQuery.dx = { $lt: 0 };
      } else if (filters.dx === 'right') {
        mongoQuery.dx = { $gte: 0 };
      } else if (typeof filters.dx === 'object') {
        mongoQuery.dx = filters.dx; // Allow direct operator objects
      }
    }

    // OPTIONAL: color1 (exact match, null/empty means all)
    if (filters.color1) {
      mongoQuery.color1 = filters.color1;
    }

    // OPTIONAL: color2 (exact match, null/empty means all)
    if (filters.color2) {
      mongoQuery.color2 = filters.color2;
    }

    // OPTIONAL: minDistance (calculated distance >= minDistance)
    // Note: Distance filtering requires aggregation pipeline, not simple query
    // This would need to be implemented on the backend with $expr
    if (filters.minDistance !== undefined && filters.minDistance !== null && filters.minDistance !== '') {
      // For now, log warning - this requires backend aggregation support
      console.warn('minDistance filter requires backend aggregation support - not yet implemented');
    }

    // Options: limit
    if (filters.limit !== undefined && filters.limit !== null) {
      options.limit = parseInt(filters.limit, 10);
    }

    // Options: skip (pagination)
    if (filters.skip !== undefined && filters.skip !== null) {
      options.skip = parseInt(filters.skip, 10);
    }

    const response = await getApi().post('/paths/query', {
      query: mongoQuery,
      options: options,
    });
    return response.data;
  },

  getById: async (id) => {
    const response = await getApi().get(`/paths/${id}`);
    return response.data;
  },

  getStats: async (serialNumber, filters) => {
    const response = await getApi().get(`/paths/stats/${serialNumber}`, {
      params: filters,
    });
    return response.data;
  },
};

// Authentication API
export const authAPI = {
  // Login (accepts server URL since server is selected during login)
  // Uses /auth/client-login endpoint which returns JWT token
  login: async (credentials, serverUrl) => {
    const normalizedUrl = normalizeServerUrl(serverUrl);
    const loginApi = axios.create({
      baseURL: `${normalizedUrl}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const response = await loginApi.post('/auth/client-login', credentials);
    return response.data;
  },

  // Get current user
  me: async () => {
    const response = await getApi().get('/auth/me');
    return response.data;
  },
};

// User Preferences API
export const userPreferencesAPI = {
  getPreferences: async () => {
    const response = await getApi().get('/users/me/preferences');
    return response.data;
  },

  updatePreferences: async (preferences) => {
    const response = await getApi().put('/users/me/preferences', preferences);
    return response.data;
  },
};

// Configuration API
export const configAPI = {
  getSystemConfig: async () => {
    const response = await getApi().get('/config/system');
    return response.data;
  },

  updateSystemConfig: async (config) => {
    const response = await getApi().put('/config/system', config);
    return response.data;
  },
};

// Playback API
export const playbackAPI = {
  // Get video URL for a path event
  getVideoUrl: (playbackConfig, pathEvent) => {
    if (!playbackConfig || !playbackConfig.enabled || !playbackConfig.serverUrl || !playbackConfig.apiKey) {
      return null;
    }

    if (!pathEvent || !pathEvent.serialNumber || !pathEvent.timestamp || !pathEvent.age) {
      return null;
    }

    const { type, serverUrl, apiKey, preTime, postTime } = playbackConfig;

    // Currently only VideoX is implemented
    if (type === 'VideoX') {
      const eventDate = new Date(pathEvent.timestamp);
      const startTime = Math.floor(eventDate.getTime() / 1000) - (preTime || 5);
      const duration = Math.ceil(pathEvent.age) + (preTime || 5) + (postTime || 5);

      // Note: API key must be included in URL since <video> element cannot send Authorization headers
      // The VideoX server must support token authentication via query parameter or URL-based auth
      const url = `${serverUrl}/api/recordings/export-clip?cameraId=${pathEvent.serialNumber}&startTime=${startTime}&duration=${duration}&token=${apiKey}`;

      return {
        url,
        startTime,
        duration,
        apiKey,
        type,
      };
    } else if (type === 'ACS') {
      // ACS implementation to be added later
      return null;
    } else if (type === 'Milestone') {
      // Milestone implementation to be added later
      return null;
    }

    return null;
  },

  // Get download URL for a path event
  getDownloadUrl: (playbackConfig, pathEvent) => {
    const videoInfo = playbackAPI.getVideoUrl(playbackConfig, pathEvent);
    if (!videoInfo) return null;

    // Currently only VideoX supports downloads
    // The export-clip endpoint can be used for both streaming and downloading
    if (playbackConfig.type === 'VideoX') {
      return videoInfo.url;
    }

    return null;
  },
};

// Counter Sets API
// Transforms backend field names (total/byClass/mqttTopic/mqttInterval)
// to frontend field names (value/classes/mqtt.topic/mqtt.intervalSeconds)
const _toFrontendCounterSet = (cs) => {
  if (!cs) return null;
  const resetAt = cs.resetAt || null;
  const counters = (cs.counters || []).map(c => ({
    id:        c.id,
    from:      c.from,
    to:        c.to,
    name:      c.name || '',
    enabled:   c.enabled !== false,
    value:     c.total ?? c.value ?? 0,
    classes:   c.byClass instanceof Map ? Object.fromEntries(c.byClass) : (c.byClass || c.classes || {}),
    lastReset: c.lastReset || resetAt || null,
  }));
  return {
    _id:           cs._id,
    name:          cs.name,
    serial:        cs.serial,
    objectClasses: cs.objectClasses || [],
    zones:         cs.zones || [],
    counters,
    mqtt: {
      enabled:         !!(cs.mqttTopic),
      topic:           cs.mqttTopic || '',
      intervalSeconds: cs.mqttInterval ?? 60,
    },
    days:      cs.days ?? 0,
    backfill:  cs.backfill || null,
    resetAt,
    createdAt: cs.createdAt,
    updatedAt: cs.updatedAt,
  };
};

const _toBackendBody = (body) => {
  const out = { ...body };
  if (body.mqtt) {
    // If enabled is explicitly false, clear the topic so MQTT stops
    out.mqttTopic    = body.mqtt.enabled ? (body.mqtt.topic || '') : '';
    out.mqttInterval = body.mqtt.intervalSeconds ?? 60;
    delete out.mqtt;
  }
  return out;
};

export const countersAPI = {
  list: async () => {
    const response = await getApi().get('/counters');
    return (response.data.data || []).map(_toFrontendCounterSet);
  },

  get: async (id) => {
    const response = await getApi().get(`/counters/${id}`);
    return _toFrontendCounterSet(response.data.data);
  },

  create: async (body) => {
    const response = await getApi().post('/counters', _toBackendBody(body));
    return _toFrontendCounterSet(response.data.data);
  },

  update: async (id, body) => {
    const response = await getApi().put(`/counters/${id}`, _toBackendBody(body));
    return _toFrontendCounterSet(response.data.data);
  },

  delete: async (id) => {
    await getApi().delete(`/counters/${id}`);
  },

  resetAll: async (id) => {
    const response = await getApi().post(`/counters/${id}/reset`);
    return _toFrontendCounterSet(response.data.data);
  },

  resetOne: async (id, counterId) => {
    const encoded = encodeURIComponent(counterId);
    const response = await getApi().post(`/counters/${id}/counters/${encoded}/reset`);
    return _toFrontendCounterSet(response.data.data);
  },

  getBackfill: async (id) => {
    const response = await getApi().get(`/counters/${id}/backfill`);
    return response.data.data;
  },

  startBackfill: async (id) => {
    const response = await getApi().post(`/counters/${id}/backfill`);
    return response.data.data;
  },
};

// Health check
export const healthCheck = async () => {
  const response = await getApi().get('/health');
  return response.data;
};

export default getApi;
