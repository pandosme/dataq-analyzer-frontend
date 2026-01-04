import { useState } from 'react';
import PropTypes from 'prop-types';
import { useServer } from '../context/ServerContext';
import './ServerSelector.css';

function ServerSelector({ selectedServerId, onServerSelect, onAddServer, onEditServer, onDeleteServer }) {
  const { servers } = useServer();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [formData, setFormData] = useState({ name: '', url: '' });
  const [formError, setFormError] = useState('');

  const handleAddNew = () => {
    setEditingServer(null);
    setFormData({ name: '', url: '' });
    setFormError('');
    setShowAddForm(true);
  };

  const handleEdit = (server) => {
    setEditingServer(server);
    setFormData({ name: server.name, url: server.url });
    setFormError('');
    setShowAddForm(true);
  };

  const handleDelete = (serverId, e) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this server?')) {
      onDeleteServer(serverId);
      if (selectedServerId === serverId) {
        onServerSelect(null);
      }
    }
  };

  const handleSave = () => {
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Server name is required');
      return;
    }

    if (!formData.url.trim()) {
      setFormError('Server URL is required');
      return;
    }

    // Validate URL format
    try {
      new URL(formData.url);
    } catch {
      setFormError('Please enter a valid URL (e.g., http://localhost:3000)');
      return;
    }

    if (editingServer) {
      onEditServer(editingServer.id, formData);
    } else {
      onAddServer(formData);
    }

    setShowAddForm(false);
    setFormData({ name: '', url: '' });
    setEditingServer(null);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setFormData({ name: '', url: '' });
    setFormError('');
    setEditingServer(null);
  };

  return (
    <div className="server-selector-videox">
      {!showAddForm ? (
        <>
          <div className="server-list-videox">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`server-card ${selectedServerId === server.id ? 'selected' : ''}`}
                onClick={() => onServerSelect(server.id)}
              >
                <div className="server-card-content">
                  <div className="server-card-header">DataQ Server</div>
                  <div className="server-card-name">{server.name}</div>
                  <div className="server-card-url">{server.url}</div>
                </div>
                <div className="server-card-actions">
                  <button
                    type="button"
                    className="server-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(server);
                    }}
                    title="Edit"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="server-action-btn server-delete-btn"
                    onClick={(e) => handleDelete(server.id, e)}
                    title="Delete"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                      <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="add-server-btn" onClick={handleAddNew}>
            <span className="add-icon">+</span> ADD NEW SERVER
          </button>
        </>
      ) : (
        <div className="server-form-videox">
          <h3>{editingServer ? 'Edit Server' : 'Add New Server'}</h3>

          {formError && <div className="form-error">{formError}</div>}

          <div className="form-group-videox">
            <label htmlFor="server-name">Server Name</label>
            <input
              type="text"
              id="server-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Production Server"
              autoFocus
            />
          </div>

          <div className="form-group-videox">
            <label htmlFor="server-url">Server URL</label>
            <input
              type="text"
              id="server-url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="e.g., https://dataq.example.com:3000"
            />
          </div>

          <div className="form-actions-videox">
            <button type="button" className="btn-save-videox" onClick={handleSave}>
              {editingServer ? 'Save Changes' : 'Add Server'}
            </button>
            <button type="button" className="btn-cancel-videox" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

ServerSelector.propTypes = {
  selectedServerId: PropTypes.string,
  onServerSelect: PropTypes.func.isRequired,
  onAddServer: PropTypes.func.isRequired,
  onEditServer: PropTypes.func.isRequired,
  onDeleteServer: PropTypes.func.isRequired,
};

export default ServerSelector;
