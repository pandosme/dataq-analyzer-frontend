import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { useAuth } from '../context/AuthContext';
import { configAPI } from '../services/api';
import './UserSettings.css';

function UserSettings({ onClose }) {
  const {
    dateFormat,
    timeFormat,
    theme,
    videoPreTime,
    videoPostTime,
    systemConfig,
    userPreferences,
    updatePreferences,
  } = useUserPreferences();
  const { isAdmin } = useAuth();

  const [formData, setFormData] = useState({
    dateFormat: '',
    timeFormat: '',
    theme: '',
    videoPreTime: '',
    videoPostTime: '',
  });

  // Admin-only: Video server system config
  const [serverConfig, setServerConfig] = useState({
    type: 'VideoX',
    serverUrl: '',
    apiKey: '',
    preTime: 5,
    postTime: 10,
    enabled: false,
  });
  const [serverSaving, setServerSaving] = useState(false);
  const [serverSaved, setServerSaved] = useState(false);
  const [serverError, setServerError] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Initialize form with current values
    setFormData({
      dateFormat: userPreferences.dateFormat || '',
      timeFormat: userPreferences.timeFormat || '',
      theme: userPreferences.theme || '',
      videoPreTime: userPreferences.videoPlayback?.preTime?.toString() || '',
      videoPostTime: userPreferences.videoPlayback?.postTime?.toString() || '',
    });
  }, [userPreferences]);

  // Load full playback config for admin
  useEffect(() => {
    if (!isAdmin()) return;
    configAPI.getSystemConfig().then(res => {
      const pc = res?.playbackConfig;
      if (pc) {
        setServerConfig({
          type: pc.enabled === false ? 'Disabled' : (pc.type || 'VideoX'),
          serverUrl: pc.serverUrl || '',
          apiKey: pc.apiKey || '',
          preTime: pc.preTime ?? 5,
          postTime: pc.postTime ?? 10,
          enabled: pc.enabled !== false,
        });
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleServerChange = (field, value) => {
    setServerConfig(prev => ({ ...prev, [field]: value }));
    setServerSaved(false);
    setServerError('');
  };

  const handleServerSave = async () => {
    setServerSaving(true);
    setServerError('');
    try {
      const payload = {
        playbackConfig: {
          type: serverConfig.type === 'Disabled' ? 'VideoX' : serverConfig.type,
          enabled: serverConfig.type !== 'Disabled',
          serverUrl: serverConfig.serverUrl,
          apiKey: serverConfig.apiKey,
          preTime: Number(serverConfig.preTime) || 5,
          postTime: Number(serverConfig.postTime) || 10,
        },
      };
      await configAPI.updateSystemConfig(payload);
      setServerSaved(true);
      setTimeout(() => setServerSaved(false), 3000);
    } catch (err) {
      setServerError(err.message || 'Failed to save server config');
    } finally {
      setServerSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const preferences = {
        // Send all fields (empty string = reset to system default)
        dateFormat: formData.dateFormat || null,
        timeFormat: formData.timeFormat || null,
        theme: formData.theme || null,
        videoPlayback: {},
      };

      // Handle video playback fields
      if (formData.videoPreTime) {
        preferences.videoPlayback.preTime = parseInt(formData.videoPreTime, 10);
      } else {
        preferences.videoPlayback.preTime = null;
      }

      if (formData.videoPostTime) {
        preferences.videoPlayback.postTime = parseInt(formData.videoPostTime, 10);
      } else {
        preferences.videoPlayback.postTime = null;
      }

      await updatePreferences(preferences);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
      alert('Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // Reset all to system defaults (clear user preferences)
    setFormData({
      dateFormat: '',
      timeFormat: '',
      theme: '',
      videoPreTime: '',
      videoPostTime: '',
    });
  };

  const getEffectiveValue = (field) => {
    if (formData[field]) return formData[field];

    switch (field) {
      case 'dateFormat':
        return systemConfig.dateFormat;
      case 'timeFormat':
        return systemConfig.timeFormat;
      case 'theme':
        return 'light';
      case 'videoPreTime':
        return systemConfig.playback.preTime;
      case 'videoPostTime':
        return systemConfig.playback.postTime;
      default:
        return '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>User Settings</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3>Display Preferences</h3>

            <div className="setting-item">
              <label>Date Format</label>
              <select
                value={formData.dateFormat}
                onChange={(e) => handleChange('dateFormat', e.target.value)}
              >
                <option value="">Use System Default ({systemConfig.dateFormat})</option>
                <option value="US">US (MM/DD/YYYY)</option>
                <option value="EU">EU (DD/MM/YYYY)</option>
                <option value="ISO">ISO (YYYY-MM-DD)</option>
              </select>
              <span className="setting-preview">
                Current: {dateFormat === 'US' ? 'MM/DD/YYYY' : dateFormat === 'EU' ? 'DD/MM/YYYY' : 'YYYY-MM-DD'}
              </span>
            </div>

            <div className="setting-item">
              <label>Time Format</label>
              <select
                value={formData.timeFormat}
                onChange={(e) => handleChange('timeFormat', e.target.value)}
              >
                <option value="">Use System Default ({systemConfig.timeFormat})</option>
                <option value="12h">12-hour (3:45 PM)</option>
                <option value="24h">24-hour (15:45)</option>
              </select>
              <span className="setting-preview">
                Current: {timeFormat === '12h' ? '12-hour' : '24-hour'}
              </span>
            </div>

            <div className="setting-item">
              <label>Theme</label>
              <select
                value={formData.theme}
                onChange={(e) => handleChange('theme', e.target.value)}
              >
                <option value="">Use Default (Light)</option>
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
              <span className="setting-preview">
                Current: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
          </div>

          <div className="settings-section">
            <h3>Video Playback</h3>

            <div className="setting-item">
              <label>Pre-roll Time (seconds)</label>
              <input
                type="number"
                min="0"
                max="60"
                value={formData.videoPreTime}
                onChange={(e) => handleChange('videoPreTime', e.target.value)}
                placeholder={`Default: ${systemConfig.playback.preTime}s`}
              />
              <span className="setting-preview">
                Current: {videoPreTime} seconds before event
              </span>
            </div>

            <div className="setting-item">
              <label>Post-roll Time (seconds)</label>
              <input
                type="number"
                min="0"
                max="60"
                value={formData.videoPostTime}
                onChange={(e) => handleChange('videoPostTime', e.target.value)}
                placeholder={`Default: ${systemConfig.playback.postTime}s`}
              />
              <span className="setting-preview">
                Current: {videoPostTime} seconds after event
              </span>
            </div>
          </div>
        </div>

        {/* Admin-only: Video Server Configuration */}
        {isAdmin() && (
          <div className="settings-section">
            <h3>Video Server (Admin)</h3>

            <div className="setting-item">
              <label>Recording Server Type</label>
              <select
                value={serverConfig.type}
                onChange={(e) => handleServerChange('type', e.target.value)}
              >
                <option value="Disabled">Disabled</option>
                <option value="VideoX">VideoX</option>
                <option value="Milestone">Milestone</option>
                <option value="ACS">Axis Camera Station</option>
              </select>
            </div>

            {serverConfig.type !== 'Disabled' && (
              <>
                <div className="setting-item">
                  <label>Server URL</label>
                  <input
                    type="text"
                    value={serverConfig.serverUrl}
                    onChange={(e) => handleServerChange('serverUrl', e.target.value)}
                    placeholder="e.g. http://videox.internal"
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>

                <div className="setting-item">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={serverConfig.apiKey}
                    onChange={(e) => handleServerChange('apiKey', e.target.value)}
                    placeholder="Paste API key here"
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>

                <div className="setting-item">
                  <label>Default Pre-roll (seconds)</label>
                  <input
                    type="number" min="0" max="120"
                    value={serverConfig.preTime}
                    onChange={(e) => handleServerChange('preTime', e.target.value)}
                  />
                </div>

                <div className="setting-item">
                  <label>Default Post-roll (seconds)</label>
                  <input
                    type="number" min="0" max="120"
                    value={serverConfig.postTime}
                    onChange={(e) => handleServerChange('postTime', e.target.value)}
                  />
                </div>
              </>
            )}

            {serverError && <p style={{ color: 'red', margin: '0.5rem 0' }}>{serverError}</p>}

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
              {serverSaved && <span className="saved-indicator">✓ Saved</span>}
              <button className="btn-primary" onClick={handleServerSave} disabled={serverSaving}>
                {serverSaving ? 'Saving...' : 'Save Server Config'}
              </button>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleReset}>
            Reset to Defaults
          </button>
          <div className="button-group">
            {saved && <span className="saved-indicator">✓ Saved</span>}
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

UserSettings.propTypes = {
  onClose: PropTypes.func.isRequired,
};

export default UserSettings;
