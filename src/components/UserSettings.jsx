import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useUserPreferences } from '../context/UserPreferencesContext';
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

  const [formData, setFormData] = useState({
    dateFormat: '',
    timeFormat: '',
    theme: '',
    videoPreTime: '',
    videoPostTime: '',
  });

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
