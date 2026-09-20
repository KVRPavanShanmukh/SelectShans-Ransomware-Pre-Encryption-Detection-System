import React from 'react';
import { ShieldCheck, Server, Layout, Database, Code, Container } from 'lucide-react';

const technologies = [
  { id: 'docker', name: 'Docker', icon: <Container size={40} />, color: '#2496ed', desc: 'Containerization Platform' },
  { id: 'react', name: 'React', icon: <Layout size={40} />, color: '#61dafb', desc: 'Frontend Library' },
  { id: 'vite', name: 'Vite', icon: <Code size={40} />, color: '#646cff', desc: 'Next Generation Frontend Tooling' },
  { id: 'python', name: 'Python', icon: <Code size={40} />, color: '#3776ab', desc: 'Backend Language' },
  { id: 'flask', name: 'Flask', icon: <Server size={40} />, color: '#ffffff', desc: 'Backend Framework' },
  { id: 'mysql', name: 'MySQL', icon: <Database size={40} />, color: '#4479a1', desc: 'Relational Database' },
];

const LearningHub = () => {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#050a0e',
      color: '#fff',
      fontFamily: 'Inter, sans-serif',
      padding: '40px 20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Logo Watermark */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 0.03,
        pointerEvents: 'none',
        zIndex: 0
      }}>
        <ShieldCheck size={600} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          <ShieldCheck size={64} color="#007CC3" style={{ marginBottom: 20 }} />
          <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: '0 0 10px 0', background: 'linear-gradient(90deg, #007CC3, #00d2ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Tech Stack Learning Hub
          </h1>
          <p style={{ color: '#8892b0', fontSize: '1.2rem' }}>
            Explore the technologies powering the SelectShans Pre-Encryption Detection System
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 30,
          padding: 20
        }}>
          {technologies.map(tech => (
            <div
              key={tech.id}
              onClick={() => window.open(`/learning-hub/${tech.id}`, '_blank', 'noopener,noreferrer')}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                padding: 30,
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-10px) scale(1.02)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.borderColor = tech.color;
                e.currentTarget.style.boxShadow = `0 15px 30px ${tech.color}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                color: tech.color,
                marginBottom: 20,
                filter: `drop-shadow(0 0 10px ${tech.color}66)`
              }}>
                {tech.icon}
              </div>
              <h2 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', fontWeight: 600 }}>{tech.name}</h2>
              <p style={{ margin: 0, color: '#a0aec0', fontSize: '0.95rem' }}>{tech.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LearningHub;
