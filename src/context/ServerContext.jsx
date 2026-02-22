import { createContext, useState, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';

const ServerContext = createContext(null);

export const useServer = () => {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
};

export const ServerProvider = ({ children }) => {
  const [servers, setServers] = useState([]);
  const [currentServer, setCurrentServer] = useState(null);

  // Default local server (dev only - Vite proxy forwards to dart.internal)
  const defaultLocalServer = {
    id: 'local',
    name: 'Local (dev)',
    url: '',
    isDefault: true,
  };

  // Initialize from localStorage
  useEffect(() => {
    const storedServers = localStorage.getItem('servers');
    const storedCurrentServer = localStorage.getItem('currentServer');

    let loadedServers = [];
    if (storedServers) {
      try {
        loadedServers = JSON.parse(storedServers);
      } catch (error) {
        console.error('Failed to parse stored servers:', error);
        localStorage.removeItem('servers');
      }
    }

    // Ensure the default local server is always available
    const hasLocalServer = loadedServers.some(s => s.id === 'local');
    if (!hasLocalServer) {
      loadedServers = [defaultLocalServer, ...loadedServers];
      localStorage.setItem('servers', JSON.stringify(loadedServers));
    }
    setServers(loadedServers);

    if (storedCurrentServer) {
      try {
        setCurrentServer(JSON.parse(storedCurrentServer));
      } catch (error) {
        console.error('Failed to parse stored current server:', error);
        localStorage.removeItem('currentServer');
      }
    }
  }, []);

  const addServer = (server) => {
    const newServer = {
      id: Date.now().toString(),
      name: server.name,
      url: server.url.replace(/\/+$/, ''), // Remove trailing slashes
      createdAt: new Date().toISOString(),
    };

    const updatedServers = [...servers, newServer];
    setServers(updatedServers);
    localStorage.setItem('servers', JSON.stringify(updatedServers));
    return newServer;
  };

  const updateServer = (id, updates) => {
    const updatedServers = servers.map((server) =>
      server.id === id
        ? { ...server, ...updates, url: updates.url?.replace(/\/+$/, '') || server.url }
        : server
    );
    setServers(updatedServers);
    localStorage.setItem('servers', JSON.stringify(updatedServers));

    // Update current server if it's the one being edited
    if (currentServer?.id === id) {
      const updated = updatedServers.find((s) => s.id === id);
      setCurrentServer(updated);
      localStorage.setItem('currentServer', JSON.stringify(updated));
    }
  };

  const deleteServer = (id) => {
    // Prevent deletion of default local server
    if (id === 'local') {
      console.warn('Cannot delete the default local server');
      return;
    }

    const updatedServers = servers.filter((server) => server.id !== id);
    setServers(updatedServers);
    localStorage.setItem('servers', JSON.stringify(updatedServers));

    // Clear current server if it's the one being deleted
    if (currentServer?.id === id) {
      setCurrentServer(null);
      localStorage.removeItem('currentServer');
    }
  };

  const selectServer = (server) => {
    setCurrentServer(server);
    localStorage.setItem('currentServer', JSON.stringify(server));
  };

  const clearCurrentServer = () => {
    setCurrentServer(null);
    localStorage.removeItem('currentServer');
  };

  const value = {
    servers,
    currentServer,
    addServer,
    updateServer,
    deleteServer,
    selectServer,
    clearCurrentServer,
  };

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
};

ServerProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ServerContext;
