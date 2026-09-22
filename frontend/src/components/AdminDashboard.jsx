import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { Users, Shield, Clock, Search, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';

const AdminDashboard = ({ jwtToken }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' or 'requests'

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000); // refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        setError('Failed to fetch users');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const toggleShikikanAccess = async (userId, currentAccess) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ shikikan_access: !currentAccess })
      });
      if (response.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error('Error updating permissions');
    }
  };

  const renderUserTable = (filteredUsers) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
          <th style={{ padding: '12px' }}>Status</th>
          <th style={{ padding: '12px' }}>Name / Username</th>
          <th style={{ padding: '12px' }}>Email</th>
          <th style={{ padding: '12px' }}>DOB</th>
          <th style={{ padding: '12px' }}>Recent Activity</th>
          <th style={{ padding: '12px' }}>Shiki-kan Access</th>
          <th style={{ padding: '12px' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {filteredUsers.length === 0 ? (
          <tr>
            <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
              No users found.
            </td>
          </tr>
        ) : (
          filteredUsers.map(user => {
            const isOnline = user.is_online;
            // Simple check: active within last 2 minutes
            const lastActive = user.last_active ? new Date(user.last_active) : null;
            const currentlyActive = isOnline && lastActive && (new Date() - lastActive) < 120000;

            return (
              <tr key={user.id} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: currentlyActive ? '#00FF41' : '#555' }} />
                    <span style={{ fontSize: '0.8rem', color: currentlyActive ? '#00FF41' : '#aaa' }}>
                      {currentlyActive ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '12px' }}>{user.username}</td>
                <td style={{ padding: '12px', fontSize: '0.85rem' }}>{user.email}</td>
                <td style={{ padding: '12px', fontSize: '0.85rem' }}>{user.dob}</td>
                <td style={{ padding: '12px', fontSize: '0.85rem', color: '#888' }}>
                  {lastActive ? lastActive.toLocaleString() : 'Never'}
                </td>
                <td style={{ padding: '12px' }}>
                  {user.shikikan_access ? (
                    <span style={{ color: '#00FF41', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14}/> Granted</span>
                  ) : (
                    <span style={{ color: '#ff4d4d', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={14}/> Denied</span>
                  )}
                  {user.shikikan_requested && !user.shikikan_access && (
                    <div style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: 4 }}>Requested Access!</div>
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  <button
                    onClick={() => toggleShikikanAccess(user.id, user.shikikan_access)}
                    style={{
                      background: user.shikikan_access ? 'rgba(255, 77, 77, 0.2)' : 'rgba(0, 255, 65, 0.2)',
                      color: user.shikikan_access ? '#ff4d4d' : '#00FF41',
                      border: `1px solid ${user.shikikan_access ? '#ff4d4d' : '#00FF41'}`,
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    {user.shikikan_access ? 'Revoke Access' : 'Grant Access'}
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading Admin Data...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#ff4d4d' }}>{error}</div>;

  const standardUsers = users.filter(u => u.role !== 'admin');
  const requestedUsers = standardUsers.filter(u => u.shikikan_requested && !u.shikikan_access);

  return (
    <div style={{ padding: '20px 40px' }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 30 }}>
        <div style={{ flex: 1, background: '#111', padding: 20, borderRadius: 8, borderLeft: '4px solid #00FF41' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#00FF41', marginBottom: 10 }}>
            <Users size={24} />
            <h3 style={{ margin: 0 }}>Total Users</h3>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{standardUsers.length}</div>
        </div>
        
        <div style={{ flex: 1, background: '#111', padding: 20, borderRadius: 8, borderLeft: '4px solid #ff4d4d' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ff4d4d', marginBottom: 10 }}>
            <ShieldAlert size={24} />
            <h3 style={{ margin: 0 }}>Pending Shiki-kan Requests</h3>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{requestedUsers.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'all' ? '#222' : 'transparent',
            border: '1px solid #333',
            color: activeTab === 'all' ? '#fff' : '#888',
            cursor: 'pointer',
            borderRadius: 4
          }}
        >
          All Users
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'requests' ? '#222' : 'transparent',
            border: '1px solid #333',
            color: activeTab === 'requests' ? '#ff4d4d' : '#888',
            cursor: 'pointer',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          Shiki-kan Requests
          {requestedUsers.length > 0 && (
            <span style={{ background: '#ff4d4d', color: '#1a202c', borderRadius: '50%', padding: '2px 6px', fontSize: '0.7rem' }}>
              {requestedUsers.length}
            </span>
          )}
        </button>
      </div>

      <div style={{ background: '#111', padding: 20, borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#ccc' }}>
          {activeTab === 'all' ? 'User Monitoring & Permissions' : 'Pending Access Requests'}
        </h3>
        {renderUserTable(activeTab === 'all' ? standardUsers : requestedUsers)}
      </div>
    </div>
  );
};

export default AdminDashboard;
