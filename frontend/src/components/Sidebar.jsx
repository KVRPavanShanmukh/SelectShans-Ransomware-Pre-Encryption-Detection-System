import React from 'react';
import { LayoutDashboard, UploadCloud, ShieldCheck, Settings, LogOut, Database, Lock } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Threat Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'upload', label: 'Analysis Lab', icon: <UploadCloud size={18} /> },
    { id: 'logs', label: 'Sysmon Logs', icon: <Database size={18} /> },
    { id: 'protection', label: 'Active Shield', icon: <ShieldCheck size={18} /> },
    { id: 'encryption', label: 'Encryption Lab', icon: <Lock size={18} /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <ShieldCheck color="var(--primary-bright)" size={28} />
        <h2>SentinelStream</h2>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.id === 'encryption' && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '0.55rem',
                fontWeight: 700,
                letterSpacing: 1,
                color: 'var(--warning)',
                border: '1px solid rgba(255,204,0,0.4)',
                padding: '1px 5px',
                fontFamily: 'JetBrains Mono, monospace',
              }}>NEW</span>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={18} />
          <span>Settings</span>
        </div>
        <div className="nav-item logout" onClick={onLogout}>
          <LogOut size={18} />
          <span>Logout</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;