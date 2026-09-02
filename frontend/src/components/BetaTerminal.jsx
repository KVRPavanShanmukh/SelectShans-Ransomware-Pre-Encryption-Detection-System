import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X } from 'lucide-react';

const BetaTerminal = ({ jwtToken, betaToken, onClose }) => {
  const [history, setHistory] = useState([
    { type: 'system', text: 'SelectShans Beta Terminal - Secured Connection Established' },
    { type: 'system', text: 'Type "help" to see available commands.' }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const terminalEndRef = useRef(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  const handleCommand = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim();
    setInput('');
    setHistory(prev => [...prev, { type: 'user', text: `admin@beta-layer:~$ ${cmd}` }]);
    setIsProcessing(true);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/beta/terminal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`,
          'X-Beta-Token': betaToken
        },
        body: JSON.stringify({ command: cmd })
      });

      const data = await response.json();
      
      if (response.ok) {
        setHistory(prev => [...prev, { type: 'output', text: data.output }]);
      } else {
        setHistory(prev => [...prev, { type: 'error', text: data.error || 'Execution failed' }]);
      }
    } catch {
      setHistory(prev => [...prev, { type: 'error', text: 'Connection to Beta Layer failed' }]);
    }
    
    setIsProcessing(false);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#050510', border: '1px solid #0ff',
      boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)',
      fontFamily: '"Courier New", Courier, monospace', color: '#0ff', overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(0, 255, 255, 0.1)', padding: '10px 15px', borderBottom: '1px solid #0ff',
        boxShadow: '0 2px 5px rgba(0,255,255,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TerminalIcon size={18} color="#0ff" style={{ filter: 'drop-shadow(0 0 2px #0ff)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0ff', textShadow: '0 0 5px #0ff', textTransform: 'uppercase', letterSpacing: 1 }}>BETA_LAYER // TERMINAL</span>
        </div>
        <X size={18} color="#f0f" style={{ cursor: 'pointer', filter: 'drop-shadow(0 0 2px #f0f)' }} onClick={onClose} />
      </div>

      <div style={{ flex: 1, padding: 15, overflowY: 'auto', background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)' }}>
        {history.map((line, idx) => (
          <div key={idx} style={{
            marginBottom: 8,
            color: line.type === 'error' ? '#f00' : line.type === 'user' ? '#fff' : '#0ff',
            textShadow: line.type === 'error' ? '0 0 5px #f00' : line.type === 'user' ? 'none' : '0 0 3px #0ff',
            whiteSpace: 'pre-wrap'
          }}>
            {line.text}
          </div>
        ))}
        {isProcessing && <div style={{ color: '#ff0', textShadow: '0 0 3px #ff0' }}>PROCESSING_QUERY...</div>}
        <div ref={terminalEndRef} />
      </div>

      <form onSubmit={handleCommand} style={{
        display: 'flex', background: 'rgba(0,0,0,0.5)', padding: '10px 15px',
        borderTop: '1px solid #0ff'
      }}>
        <span style={{ color: '#ff0', marginRight: 10, textShadow: '0 0 2px #ff0' }}>sysadmin@beta:~$</span>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: '#fff', fontFamily: '"Courier New", Courier, monospace', outline: 'none'
          }}
          disabled={isProcessing}
          autoFocus
        />
      </form>
    </div>
  );
};

export default BetaTerminal;
