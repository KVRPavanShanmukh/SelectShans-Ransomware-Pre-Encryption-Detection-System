import { API_URL } from '../config';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Shield,
  Clock,
  Search,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Activity,
  Zap,
  Radio,
  ExternalLink,
  LogOut,
  RefreshCw,
  Crosshair,
  Sparkles,
  Lock,
  Unlock,
  SlidersHorizontal
} from 'lucide-react';
import AdminTopology3D from './AdminTopology3D';
import './AdminDashboard.css';

const AdminDashboard = ({ jwtToken, onSwitchToThreatConsole, onLogout }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'requests', or 'verified'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [hoveredUserId, setHoveredUserId] = useState(null);
  const [flyToUserId, setFlyToUserId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const token = jwtToken || localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000); // Poll fresh telemetry every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(Array.isArray(data) ? data : []);
        setError(null);
      } else {
        setError('Failed to fetch administrator telemetry');
      }
    } catch (err) {
      setError('Connection error with security cluster');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await fetchUsers();
    setTimeout(() => setIsSyncing(false), 500);
  };

  const toggleShikikanAccess = async (userId, currentAccess) => {
    setActionLoadingId(userId);
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ shikikan_access: !currentAccess })
      });
      if (response.ok) {
        await fetchUsers();
      }
    } catch (err) {
      console.error('Error updating permissions', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter out system admins for normal endpoint topology & permission view
  const standardUsers = useMemo(() => {
    return (Array.isArray(users) ? users : []).filter((u) => u && u.role !== 'admin');
  }, [users]);

  // Derived KPI Counts
  const requestedUsers = useMemo(() => {
    return standardUsers.filter((u) => u && u.shikikan_requested && !u.shikikan_access);
  }, [standardUsers]);

  const verifiedUsers = useMemo(() => {
    return standardUsers.filter((u) => u && u.shikikan_access);
  }, [standardUsers]);

  const onlineEndpoints = useMemo(() => {
    return standardUsers.filter((u) => u && u.is_online);
  }, [standardUsers]);

  // Search & Tab filtered dataset
  const filteredUsers = useMemo(() => {
    let dataset = standardUsers;
    if (activeTab === 'requests') {
      dataset = requestedUsers;
    } else if (activeTab === 'verified') {
      dataset = verifiedUsers;
    }

    if (!searchQuery.trim()) return dataset;
    const q = searchQuery.toLowerCase().trim();
    return dataset.filter(
      (u) =>
        u &&
        ((u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.dob && String(u.dob).includes(q)))
    );
  }, [standardUsers, requestedUsers, verifiedUsers, activeTab, searchQuery]);

  const handleInspectIn3D = (userId) => {
    setSelectedUserId(userId);
    setFlyToUserId(userId);
    // Smooth scroll to top of 3D stage if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConsoleSwitch = () => {
    if (typeof onSwitchToThreatConsole === 'function') {
      onSwitchToThreatConsole();
    } else {
      sessionStorage.setItem('admin_view_mode', 'threat_console');
      window.location.reload();
    }
  };

  const handleAdminSignOut = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    } else {
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = '/';
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="admin-soc-deck">
        <div className="admin-loading-spinner">
          <Activity size={32} className="spin-icon" color="#00ffcc" />
          <span>Synchronizing Studio 3D SOC Topology & User Telemetry...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-soc-deck">
      {/* 1. Tactical Command Header Strip */}
      <div className="admin-header-strip">
        <div className="admin-title-badge">
          <div className="admin-title-icon">
            <Radio size={20} color="#00ffcc" />
          </div>
          <div className="admin-title-text">
            <h1>SelectShans SOC Admin Control</h1>
            <span>Studio 3D Cyber-Topology & RBAC Command Deck</span>
          </div>
        </div>

        <div className="admin-quick-actions">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="admin-action-btn secondary"
            title="Refresh Live Telemetry"
          >
            <RefreshCw size={14} className={isSyncing ? 'spin-icon' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>
          <button
            onClick={handleConsoleSwitch}
            className="admin-action-btn secondary"
            title="Switch to Realtime Threat Console"
          >
            <ExternalLink size={14} />
            <span>Threat Console</span>
          </button>
          <button
            onClick={handleAdminSignOut}
            className="admin-action-btn danger"
            title="Sign out of SOC Admin Session"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* 2. Studio-Grade 3D Isometric Cyber-Topology Stage */}
      <div className="admin-topology-hero">
        <AdminTopology3D
          users={standardUsers}
          selectedUserId={selectedUserId}
          hoveredUserId={hoveredUserId}
          flyToUserId={flyToUserId}
          onSelectUser={(userId) => {
            setSelectedUserId(userId === selectedUserId ? null : userId);
          }}
          onHoverUser={(userId) => setHoveredUserId(userId)}
        />
      </div>

      {/* 3. Floating KPI Telemetry Strip (Docked below 3D stage) */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card kpi-cyan">
          <div className="admin-kpi-header">
            <span className="admin-kpi-label">Registered Operators</span>
            <div className="admin-kpi-icon-wrap">
              <Users size={18} />
            </div>
          </div>
          <div className="admin-kpi-value">{standardUsers.length}</div>
          <div className="admin-kpi-caption">
            <Activity size={12} color="#00ffcc" />
            Active endpoint workstations on network
          </div>
        </div>

        <div className={`admin-kpi-card kpi-amber ${requestedUsers.length > 0 ? 'pulse-danger' : ''}`}>
          <div className="admin-kpi-header">
            <span className="admin-kpi-label">Pending Shiki-kan</span>
            <div className="admin-kpi-icon-wrap">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="admin-kpi-value">{requestedUsers.length}</div>
          <div className="admin-kpi-caption">
            <Clock size={12} color={requestedUsers.length > 0 ? '#ff3b5c' : '#f59e0b'} />
            {requestedUsers.length > 0 ? 'Immediate action required' : 'No pending approval requests'}
          </div>
        </div>

        <div className="admin-kpi-card kpi-emerald">
          <div className="admin-kpi-header">
            <span className="admin-kpi-label">Step-Up Verified</span>
            <div className="admin-kpi-icon-wrap">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="admin-kpi-value">{verifiedUsers.length}</div>
          <div className="admin-kpi-caption">
            <CheckCircle size={12} color="#10b981" />
            Full Shiki-kan privileged clearance
          </div>
        </div>

        <div className="admin-kpi-card kpi-sky">
          <div className="admin-kpi-header">
            <span className="admin-kpi-label">3D Telemetry Links</span>
            <div className="admin-kpi-icon-wrap">
              <Zap size={18} />
            </div>
          </div>
          <div className="admin-kpi-value">{onlineEndpoints.length}</div>
          <div className="admin-kpi-caption">
            <span className="node-status-dot online" style={{ margin: 0 }} />
            Fiber-optic conduits transmitting live
          </div>
        </div>
      </div>

      {/* 4. Filter Pills & Instant Search Strip */}
      <div className="admin-table-controls">
        <div className="admin-tabs-group">
          <button
            onClick={() => setActiveTab('all')}
            className={`admin-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          >
            <span>All Operators</span>
            <span className="admin-tab-count">{standardUsers.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`admin-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
          >
            <span>Pending Requests</span>
            <span
              className="admin-tab-count"
              style={{
                background: requestedUsers.length > 0 ? '#ff3b5c' : undefined,
                color: requestedUsers.length > 0 ? '#ffffff' : undefined
              }}
            >
              {requestedUsers.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('verified')}
            className={`admin-tab-btn ${activeTab === 'verified' ? 'active' : ''}`}
          >
            <span>Verified Shiki-kan</span>
            <span className="admin-tab-count">{verifiedUsers.length}</span>
          </button>
        </div>

        <div className="admin-search-wrap">
          <Search size={16} className="admin-search-icon" />
          <input
            type="text"
            placeholder="Search by operator, email, or DOB..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-search-input"
          />
        </div>
      </div>

      {/* 5. User Monitoring & Permissions Matrix */}
      <div className="admin-table-deck">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Operator / Username</th>
              <th>Registered Email</th>
              <th>DOB Token</th>
              <th>Last Seen Activity</th>
              <th>Shiki-kan Clearance</th>
              <th style={{ textAlign: 'right' }}>Authorization Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="7" className="admin-empty-state">
                  No endpoint operators match current filter criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isOnline = Boolean(user.is_online);
                const lastActive = user.last_active ? new Date(user.last_active) : null;
                const isSelected = selectedUserId === user.id;
                const isHovered = hoveredUserId === user.id;

                let statusPillClass = 'none';
                let statusPillText = 'Standard Operator';
                if (user.shikikan_access) {
                  statusPillClass = 'verified';
                  statusPillText = 'Verified Shiki-kan';
                } else if (user.shikikan_requested) {
                  statusPillClass = 'pending';
                  statusPillText = 'Pending Approval';
                }

                return (
                  <tr
                    key={user.id}
                    className={`admin-table-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedUserId(isSelected ? null : user.id)}
                    onMouseEnter={() => setHoveredUserId(user.id)}
                    onMouseLeave={() => setHoveredUserId(null)}
                    style={{
                      background: isHovered ? 'rgba(0, 255, 204, 0.08)' : undefined
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className={`node-status-dot ${isOnline ? 'online' : 'offline'}`} />
                        <span
                          style={{
                            fontSize: '0.74rem',
                            color: isOnline ? '#00ffcc' : '#64748b',
                            fontWeight: 700
                          }}
                        >
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.86rem' }}>
                        {user.username}
                      </div>
                    </td>
                    <td
                      style={{
                        color: '#94a3b8',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.78rem'
                      }}
                    >
                      {user.email}
                    </td>
                    <td style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
                      {user.dob || '—'}
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.76rem' }}>
                      {lastActive ? lastActive.toLocaleString() : 'Never Active'}
                    </td>
                    <td>
                      <span className={`shikikan-pill ${statusPillClass}`}>
                        {user.shikikan_access ? (
                          <ShieldCheck size={12} />
                        ) : user.shikikan_requested ? (
                          <ShieldAlert size={12} />
                        ) : (
                          <Shield size={12} />
                        )}
                        {statusPillText}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectIn3D(user.id);
                          }}
                          className="admin-row-action-btn inspect"
                          title="Fly 3D Camera to this Endpoint"
                        >
                          <Crosshair size={12} />
                          <span>Inspect in 3D</span>
                        </button>

                        <button
                          disabled={actionLoadingId === user.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleShikikanAccess(user.id, user.shikikan_access);
                          }}
                          className={`admin-row-action-btn ${user.shikikan_access ? 'revoke' : 'approve'}`}
                        >
                          {actionLoadingId === user.id ? (
                            'Updating...'
                          ) : user.shikikan_access ? (
                            'Revoke Access'
                          ) : user.shikikan_requested ? (
                            'Approve Shiki-kan'
                          ) : (
                            'Grant Clearance'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;
