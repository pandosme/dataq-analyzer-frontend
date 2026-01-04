import { useState } from 'react';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import ServerSelector from './ServerSelector';
import './Login.css';

function Login() {
  const { login } = useAuth();
  const { servers, addServer, updateServer, deleteServer } = useServer();
  const [step, setStep] = useState('server'); // 'server' or 'credentials'
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddServer = (serverData) => {
    const newServer = addServer(serverData);
    setSelectedServerId(newServer.id);
  };

  const handleEditServer = (serverId, serverData) => {
    updateServer(serverId, serverData);
  };

  const handleDeleteServer = (serverId) => {
    deleteServer(serverId);
  };

  const handleContinue = () => {
    if (!selectedServerId) {
      setError('Please select a server');
      return;
    }
    setError('');
    setStep('credentials');
  };

  const handleBack = () => {
    setStep('server');
    setError('');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.password) {
      setError('Please enter username and password');
      return;
    }

    const selectedServer = servers.find((s) => s.id === selectedServerId);
    if (!selectedServer) {
      setError('Selected server not found');
      return;
    }

    try {
      setLoading(true);

      // Log attempt in development
      if (import.meta.env.DEV) {
        console.log('Login attempt:', {
          server: selectedServer.url,
          username: formData.username,
          url: `${selectedServer.url}/api/auth/login`
        });
      }

      const response = await authAPI.login(
        {
          username: formData.username,
          password: formData.password,
        },
        selectedServer.url
      );

      if (import.meta.env.DEV) {
        console.log('Login response:', response);
      }

      if (response.success) {
        login(response.data.user, response.data.token, selectedServer);
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      // Log full error in development
      if (import.meta.env.DEV) {
        console.error('Login error details:', {
          message: err.message,
          code: err.code,
          response: err.response,
          config: err.config,
          stack: err.stack
        });
      }

      let errorMessage;

      if (err.response?.status === 401) {
        errorMessage = 'Invalid username or password';
      } else if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        errorMessage = import.meta.env.DEV
          ? `Cannot connect to server at ${selectedServer.url}/api/auth/login\n\nError: ${err.message}\nCode: ${err.code || 'N/A'}\n\nMake sure the server is running and accessible.`
          : 'Cannot connect to server. Please check the server URL and try again.';
      } else {
        errorMessage = import.meta.env.DEV
          ? `Login failed: ${err.response?.data?.error || err.message}\n\nStatus: ${err.response?.status || 'N/A'}\nURL: ${selectedServer.url}/api/auth/login`
          : err.response?.data?.error || 'Login failed. Please try again.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const selectedServer = servers.find((s) => s.id === selectedServerId);

  return (
    <div className="login-container-videox">
      <div className="login-card-videox">
        <div className="login-header-videox">
          <h1>DataQ Analyzer</h1>
          <p>Path and Flow Analysis System</p>
        </div>

        {error && <div className="error-message-videox">{error}</div>}

        {step === 'server' ? (
          <>
            <div className="login-section-label">Select Server</div>
            <ServerSelector
              selectedServerId={selectedServerId}
              onServerSelect={setSelectedServerId}
              onAddServer={handleAddServer}
              onEditServer={handleEditServer}
              onDeleteServer={handleDeleteServer}
            />
            <button
              type="button"
              className="btn-continue"
              onClick={handleContinue}
              disabled={!selectedServerId}
            >
              CONTINUE
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="selected-server-display">
              <div className="server-display-label">Selected Server</div>
              <div className="server-display-name">{selectedServer?.name}</div>
              <div className="server-display-url">{selectedServer?.url}</div>
              <button type="button" className="btn-change-server" onClick={handleBack}>
                Change Server
              </button>
            </div>

            <div className="credentials-section">
              <div className="form-group-login">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="form-group-login">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="btn-continue" disabled={loading}>
                {loading ? 'SIGNING IN...' : 'SIGN IN'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;
