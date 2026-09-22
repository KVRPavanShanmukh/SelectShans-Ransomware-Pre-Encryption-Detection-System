import React, { useState } from 'react';
import { ShieldCheck, ChevronLeft } from 'lucide-react';

const techDetails = {
  docker: {
    name: 'Docker',
    color: '#2496ed',
    cards: [
      { q: 'What is Docker?', a: 'Docker is an open-source platform that automates the deployment, scaling, and management of applications inside lightweight, portable environments called containers.' },
      { q: 'What is a Container?', a: 'A container is a standard unit of software that packages up code and all its dependencies so the application runs quickly and reliably from one computing environment to another.' },
      { q: 'Why do we use Docker in SelectShans?', a: 'We use a unified Dockerfile to easily bundle the React frontend and Python backend together, ensuring that it runs consistently across different environments without dependency conflicts.' },
      { q: 'Basic Command: docker build', a: 'Used to build a Docker image from a Dockerfile. Example: docker build -t my-app .' },
      { q: 'Basic Command: docker run', a: 'Used to run a container from an image. Example: docker run -p 5000:5000 my-app' },
    ]
  },
  react: {
    name: 'React',
    color: '#61dafb',
    cards: [
      { q: 'What is React?', a: 'React is a declarative, efficient, and flexible JavaScript library for building user interfaces.' },
      { q: 'What are Components?', a: 'Components are independent and reusable bits of code. They serve the same purpose as JavaScript functions, but work in isolation and return HTML.' },
      { q: 'Why React for SelectShans?', a: 'React provides a snappy, single-page application experience. It allows our dashboard to update telemetry and anomaly data in real-time efficiently.' },
    ]
  },
  vite: {
    name: 'Vite',
    color: '#646cff',
    cards: [
      { q: 'What is Vite?', a: 'Vite is a build tool that aims to provide a faster and leaner development experience for modern web projects.' },
      { q: 'Why Vite instead of CRA?', a: 'Vite uses native ES modules to serve code during development, making server start and HMR (Hot Module Replacement) incredibly fast.' },
    ]
  },
  python: {
    name: 'Python',
    color: '#3776ab',
    cards: [
      { q: 'What is Python?', a: 'Python is a high-level, interpreted programming language known for its readability and versatile capabilities in web dev, data science, and scripting.' },
      { q: 'Role in SelectShans?', a: 'Python acts as the core backend language, handling the machine learning, anomaly detection logic, and routing for the FolderGuard agent telemetry.' },
    ]
  },
  flask: {
    name: 'Flask',
    color: '#ffffff',
    cards: [
      { q: 'What is Flask?', a: 'Flask is a lightweight WSGI web application framework. It is designed to make getting started quick and easy, with the ability to scale up to complex applications.' },
      { q: 'Why Flask for SelectShans?', a: 'Flask provides a simple but powerful backend for our REST API endpoints, allowing our React frontend and C# detector agent to communicate seamlessly.' },
    ]
  },
  mysql: {
    name: 'MySQL',
    color: '#4479a1',
    cards: [
      { q: 'What is MySQL?', a: 'MySQL is a widely used, open-source relational database management system (RDBMS).' },
      { q: 'Role in SelectShans?', a: 'MySQL stores all persistent data, including user accounts, detector activities, telemetry logs, and alerts in structured relational tables.' },
    ]
  }
};

const TechDetail = ({ techId }) => {
  const [activeCard, setActiveCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  const tech = techDetails[techId] || techDetails['docker'];

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setActiveCard((prev) => (prev + 1) % tech.cards.length);
    }, 150);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setActiveCard((prev) => (prev - 1 + tech.cards.length) % tech.cards.length);
    }, 150);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#050a0e',
      color: '#1a202c',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
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
        <ShieldCheck size={800} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 800 }}>
        
        <button 
          onClick={() => window.close()}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8892b0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            fontSize: '1rem',
            padding: 0,
            marginBottom: 40
          }}
        >
          <ChevronLeft size={20} /> Close Tab
        </button>

        <h1 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 40, color: tech.color }}>
          {tech.name} Fundamentals
        </h1>

        {/* Flashcard Container */}
        <div style={{
          perspective: 1000,
          width: '100%',
          height: 400,
          marginBottom: 40
        }}>
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              transition: 'transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1)',
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              cursor: 'pointer'
            }}
          >
            {/* Front of card */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${tech.color}40`,
              borderRadius: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
              boxShadow: `0 20px 40px rgba(0,0,0,0.4), inset 0 0 20px ${tech.color}10`,
              backdropFilter: 'blur(10px)'
            }}>
              <h2 style={{ fontSize: '2.2rem', textAlign: 'center', fontWeight: 600 }}>
                {tech.cards[activeCard].q}
              </h2>
              <div style={{ position: 'absolute', bottom: 20, right: 30, color: '#8892b0', fontSize: '0.9rem' }}>
                Tap to flip
              </div>
            </div>

            {/* Back of card */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              background: 'rgba(255,255,255,0.08)',
              border: `1px solid ${tech.color}`,
              borderRadius: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
              transform: 'rotateY(180deg)',
              boxShadow: `0 20px 40px rgba(0,0,0,0.4), 0 0 30px ${tech.color}30`,
              backdropFilter: 'blur(10px)'
            }}>
              <p style={{ fontSize: '1.4rem', textAlign: 'center', lineHeight: 1.6, color: '#e2e8f0' }}>
                {tech.cards[activeCard].a}
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={handlePrev}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#1a202c',
              padding: '12px 24px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Previous
          </button>
          
          <div style={{ color: '#8892b0' }}>
            {activeCard + 1} / {tech.cards.length}
          </div>

          <button 
            onClick={handleNext}
            style={{
              background: tech.color,
              border: 'none',
              color: '#1a202c',
              padding: '12px 24px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              textShadow: '0 1px 2px rgba(0,0,0,0.2)'
            }}
          >
            Next
          </button>
        </div>

      </div>
    </div>
  );
};

export default TechDetail;
