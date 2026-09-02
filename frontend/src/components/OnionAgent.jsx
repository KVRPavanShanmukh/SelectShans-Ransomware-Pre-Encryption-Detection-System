import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Sparkles, RefreshCw, Maximize2, Minimize2, Trash2, Shield, Cpu, Zap, ChevronRight, Terminal, CheckCircle2, AlertTriangle } from 'lucide-react';

const OnionAgent = ({ userId, apiBase = 'http://127.0.0.1:5000', onTriggerReport, onTriggerDetectorDownload }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'init-1',
      sender: 'onion',
      text: "👋 **Hello! I am ONION — your AI Security Sentinel & SOC Assistant.**\n\nI am actively monitoring your system for pre-encryption ransomware activity, process anomalies, and filesystem entropy spikes.\n\nAsk me anything about your current security posture or select a quick suggestion below!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      quickActions: ["Analyze security status", "Are there active threats?", "How does pre-encryption detection work?", "Generate PDF Security Report"]
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState({ anomaly_score: 0, detector: false, alerts: 0 });
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Initial diagnostic load
  useEffect(() => {
    const fetchInitialDiag = async () => {
      try {
        const storedUserId = localStorage.getItem('userId') || userId || '';
        const res = await fetch(`${apiBase}/api/onion/diagnose${storedUserId ? `?user_id=${storedUserId}` : ''}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status) {
            setAgentStatus(data.status);
          }
        }
      } catch (err) {
        console.error("ONION initial diagnostic check failed:", err);
      }
    };
    fetchInitialDiag();
  }, [userId, apiBase]);

  const handleSendMessage = async (queryText) => {
    const textToSend = queryText || inputValue;
    if (!textToSend.trim()) return;

    const userMsgId = Date.now().toString();
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInputValue('');
    setIsLoading(true);

    try {
      const storedUserId = localStorage.getItem('userId') || userId;
      const response = await fetch(`${apiBase}/api/onion/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: textToSend.trim(),
          user_id: storedUserId ? parseInt(storedUserId) : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response from ONION server');
      }

      const data = await response.json();
      
      if (data.status) {
        setAgentStatus(data.status);
      }

      const onionMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'onion',
        text: data.reply || 'ONION Agent analyzed the query.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        quickActions: data.quick_actions || [],
        actionTrigger: data.action_trigger
      };

      setMessages((prev) => [...prev, onionMsg]);

      // Check if action trigger returned
      if (data.action_trigger === 'generate_report' && onTriggerReport) {
        setTimeout(() => onTriggerReport(), 1000);
      }
    } catch (error) {
      console.error("Error communicating with ONION agent:", error);
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'onion',
        text: "⚠️ **ONION System Note:** I encountered a temporary connection issue reaching backend telemetry. Please verify backend server is running on port 5000.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (actionText) => {
    if (actionText === "Generate PDF Security Report" || actionText === "Generate Security Report") {
      if (onTriggerReport) onTriggerReport();
    }
    if (actionText === "Download detector agent") {
      if (onTriggerDetectorDownload) onTriggerDetectorDownload();
    }
    handleSendMessage(actionText);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'init-reset',
        sender: 'onion',
        text: "🔄 **ONION Console Reset.**\n\nAll chat logs cleared. How can I safeguard your host today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        quickActions: ["Analyze security status", "Are there active threats?", "How does pre-encryption detection work?"]
      }
    ]);
  };

  // Helper to format simple markdown (bold, inline code, lists)
  const formatMarkdownText = (content) => {
    if (!content) return null;
    const lines = content.split('\n');

    return lines.map((line, idx) => {
      // Bullets
      let processedLine = line;

      // Render bullet items
      const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
      if (isBullet) {
        processedLine = processedLine.replace(/^[\•\-]\s*/, '');
      }

      // Inline code replacement
      const parts = processedLine.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

      const formattedElements = parts.map((part, pIdx) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={pIdx} className="onion-code-span">
              {part.slice(1, -1)}
            </code>
          );
        } else if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} style={{ color: 'var(--primary-bright, #00FF41)' }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      return (
        <div key={idx} style={{ marginBottom: line === '' ? 8 : 4, display: isBullet ? 'flex' : 'block', alignItems: 'flex-start', gap: 6 }}>
          {isBullet && <span style={{ color: '#007CC3', fontWeight: 'bold' }}>▸</span>}
          <div>{formattedElements}</div>
        </div>
      );
    });
  };

  return (
    <div className={`onion-agent-card ${isMinimized ? 'minimized' : ''}`}>
      
      {/* HEADER BAR */}
      <div className="onion-header">
        <div className="onion-header-info">
          <div className="onion-avatar-glow">
            <Bot size={22} className="onion-icon-pulse" />
            <span className="onion-pulse-ring"></span>
          </div>
          <div>
            <div className="onion-title-row">
              <span className="onion-name">ONION AI Agent</span>
              <span className="onion-status-badge">
                <span className="onion-status-dot"></span> Online
              </span>
            </div>
            <div className="onion-subtitle">
              SOC Threat Assistant • Anomaly Level: <strong style={{ color: agentStatus.anomaly_score > 50 ? '#ef4444' : '#10b981' }}>{agentStatus.anomaly_score}%</strong>
            </div>
          </div>
        </div>

        <div className="onion-header-actions">
          <button 
            title="Clear Chat History" 
            onClick={handleClearChat}
            className="onion-action-btn"
          >
            <Trash2 size={15} />
          </button>
          <button 
            title={isMinimized ? "Expand Panel" : "Minimize Panel"} 
            onClick={() => setIsMinimized(!isMinimized)}
            className="onion-action-btn"
          >
            {isMinimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
          </button>
        </div>
      </div>

      {/* CHAT CONTENT AREA */}
      {!isMinimized && (
        <>
          <div className="onion-messages-body">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`onion-msg-wrapper ${msg.sender === 'user' ? 'user-side' : 'onion-side'}`}
              >
                {msg.sender === 'onion' && (
                  <div className="onion-avatar-small">
                    <Bot size={16} />
                  </div>
                )}
                
                <div className={`onion-msg-bubble ${msg.sender === 'user' ? 'user-bubble' : 'onion-bubble'}`}>
                  <div className="onion-msg-header">
                    <span className="onion-sender-name">
                      {msg.sender === 'user' ? 'SOC Analyst' : 'ONION Security AI'}
                    </span>
                    <span className="onion-msg-time">{msg.timestamp}</span>
                  </div>
                  
                  <div className="onion-msg-content">
                    {formatMarkdownText(msg.text)}
                  </div>

                  {/* QUICK ACTION BUTTONS */}
                  {msg.quickActions && msg.quickActions.length > 0 && (
                    <div className="onion-quick-chips">
                      {msg.quickActions.map((action, aIdx) => (
                        <button
                          key={aIdx}
                          onClick={() => handleQuickAction(action)}
                          className="onion-chip-btn"
                        >
                          <Sparkles size={12} style={{ color: '#00FF41' }} />
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="onion-msg-wrapper onion-side">
                <div className="onion-avatar-small">
                  <Bot size={16} className="onion-spin" />
                </div>
                <div className="onion-msg-bubble onion-bubble loading-bubble">
                  <div className="onion-typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 8 }}>
                    ONION is analyzing telemetry database & threat metrics...
                  </span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT BAR */}
          <div className="onion-input-bar">
            <input
              type="text"
              placeholder="Ask ONION about threats, logs, system anomaly score, or whitelists..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isLoading}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputValue.trim()}
              className="onion-send-btn"
            >
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default OnionAgent;
