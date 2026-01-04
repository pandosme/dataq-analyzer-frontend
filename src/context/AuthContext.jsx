import { createContext, useState, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { setServerUrl } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');
    const storedServer = localStorage.getItem('currentServer');

    if (storedToken && storedUser && storedServer) {
      try {
        const parsedUser = JSON.parse(storedUser);
        const parsedServer = JSON.parse(storedServer);

        setToken(storedToken);
        setUser(parsedUser);
        setServer(parsedServer);

        // Initialize API with stored server
        setServerUrl(parsedServer.url);
      } catch (error) {
        console.error('Failed to parse stored auth data:', error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        localStorage.removeItem('currentServer');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData, authToken, serverData) => {
    setUser(userData);
    setToken(authToken);
    setServer(serverData);
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('authUser', JSON.stringify(userData));
    localStorage.setItem('currentServer', JSON.stringify(serverData));

    // Update API base URL
    setServerUrl(serverData.url);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setServer(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    localStorage.removeItem('currentServer');

    // Clear API base URL
    setServerUrl(null);
  };

  const updateUser = (userData) => {
    setUser(userData);
    localStorage.setItem('authUser', JSON.stringify(userData));
  };

  const isAdmin = () => {
    return user?.role === 'admin';
  };

  const isAuthorizedForCamera = (cameraId) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.authorizedCameras?.includes(cameraId);
  };

  const value = {
    user,
    token,
    server,
    loading,
    login,
    logout,
    updateUser,
    isAuthenticated: !!token && !!user && !!server,
    isAdmin,
    isAuthorizedForCamera,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthContext;
