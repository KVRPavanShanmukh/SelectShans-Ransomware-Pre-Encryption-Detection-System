import React, { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, StopCircle, AlertTriangle, Terminal, FolderOpen } from 'lucide-react';

// Converts text to scrambled "encrypted" representation
const scramble = (text) => {
    const chars = '█▓▒░■□▪▫▬▲►▼◄◆◇○●';
    return Array.from({ length: Math.min(text.length, 30) }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('') + '==';
};

const THRESHOLD_COUNT = 5; // halt after this many files
const ENCRYPTION_KEY = 'PRD-KEY-2024';
const DELAY_MS = 900;

const now = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

const EncryptionLab = () => {
    const [files, setFiles] = useState([]);
    const [fileStates, setFileStates] = useState({});
    const [consoleLogs, setConsoleLogs] = useState([]);
    const [status, setStatus] = useState('idle'); // idle | encrypting | halted | done | decrypting | decrypted
    const [keyInput, setKeyInput] = useState('');
    const [keyError, setKeyError] = useState('');
    const encRef = useRef(null);
    const consRef = useRef(null);

    const addLog = (msg, type = '') =>
        setConsoleLogs(prev => [...prev, { ts: now(), msg, type }]);

    // Auto-scroll console
    useEffect(() => {
        if (consRef.current)
            consRef.current.scrollTop = consRef.current.scrollHeight;
    }, [consoleLogs]);

    const handleFileChange = (e) => {
        const selected = Array.from(e.target.files);
        setFiles(selected);
        const init = {};
        selected.forEach(f => { init[f.name] = { state: 'plain', scrambled: '' }; });
        setFileStates(init);
        setConsoleLogs([]);
        setStatus('idle');
        setKeyInput('');
        setKeyError('');
        addLog(`[INIT] ${selected.length} file(s) loaded into sandbox`, 'ok');
        selected.forEach(f => addLog(`  • ${f.name} (${(f.size / 1024).toFixed(1)} KB)`, ''));
    };

    const startEncryption = async () => {
        if (files.length === 0) return;
        setStatus('encrypting');
        addLog('[SYS] RandomForest traversal initiated — scanning file paths...', 'warn');
        addLog('[SYS] Entropy baseline = 0.42  |  Threshold = 70%', '');

        encRef.current = false; // halt flag

        for (let i = 0; i < files.length; i++) {
            if (encRef.current) break;

            const f = files[i];

            // Mark as encrypting
            setFileStates(prev => ({ ...prev, [f.name]: { state: 'encrypting', scrambled: '' } }));
            addLog(`[ENC ${i + 1}/${files.length}] Processing: ${f.name}`, 'warn');
            await sleep(DELAY_MS / 2);

            // Scramble
            const scrambled = scramble(f.name + Date.now());
            addLog(`  ↳ AES-256 block cipher applied — entropy +${(0.08 + Math.random() * 0.1).toFixed(2)}`, '');
            await sleep(DELAY_MS / 2);

            // Mark encrypted
            setFileStates(prev => ({ ...prev, [f.name]: { state: 'encrypted', scrambled } }));
            addLog(`  ✓ ${f.name} → ${scrambled}`, 'error');

            // Halt at threshold
            if (i + 1 >= THRESHOLD_COUNT) {
                setStatus('halted');
                addLog(`\n[HALT] Threshold reached (${THRESHOLD_COUNT} files). Encryption suspended.`, 'error');
                addLog('[SYS] Honeypot trigger detected — system isolation initiated', 'error');
                addLog('[SYS] Awaiting decryption key to restore files', 'warn');
                return;
            }

            await sleep(DELAY_MS);
        }

        if (!encRef.current) {
            setStatus('done');
            addLog('[SYS] Encryption complete. All files in unreadable state.', 'error');
        }
    };

    const haltEncryption = () => {
        encRef.current = true;
        setStatus('halted');
        addLog('[MANUAL HALT] User triggered emergency stop.', 'error');
    };

    const decryptFiles = async () => {
        if (keyInput !== ENCRYPTION_KEY) {
            setKeyError(`INVALID KEY — expected: ${ENCRYPTION_KEY}`);
            addLog('[DEC] Key verification FAILED — access denied', 'error');
            return;
        }
        setKeyError('');
        setStatus('decrypting');
        addLog('\n[DEC] Key verified ✓ — initiating decryption sequence', 'ok');
        addLog('[SYS] Writing recovered files to connected drive...', '');

        const encryptedFiles = Object.entries(fileStates).filter(([, v]) => v.state === 'encrypted');
        for (let i = 0; i < encryptedFiles.length; i++) {
            const [name] = encryptedFiles[i];
            await sleep(700);
            setFileStates(prev => ({ ...prev, [name]: { ...prev[name], state: 'decrypting' } }));
            addLog(`  ↳ Decrypting: ${name}`, 'warn');
            await sleep(500);
            setFileStates(prev => ({ ...prev, [name]: { ...prev[name], state: 'decrypted' } }));
            addLog(`  ✓ Restored: ${name}`, 'ok');
        }

        setStatus('decrypted');
        addLog('[SYS] All files safely decrypted to connected hard disk.', 'ok');
        addLog('[DB]  Session log written to MySQL. Audit trail complete.', 'ok');
    };

    const encryptedCount = Object.values(fileStates).filter(v => v.state === 'encrypted').length;
    const totalCount = files.length;
    const threshold = Math.min(encryptedCount, THRESHOLD_COUNT);
    const thresholdPct = totalCount > 0 ? (threshold / THRESHOLD_COUNT) * 100 : 0;
    const thresholdColor = thresholdPct >= 100 ? 'var(--danger)' : thresholdPct > 60 ? 'var(--warning)' : 'var(--primary)';

    const statusText = {
        idle: 'STANDBY',
        encrypting: 'ENCRYPTING...',
        halted: 'HALTED — THRESHOLD REACHED',
        done: 'ENCRYPTION COMPLETE',
        decrypting: 'DECRYPTING...',
        decrypted: 'DECRYPTION COMPLETE',
    };

    return (
        <div className="enc-lab-wrapper">
            {/* Header */}
            <div className="enc-lab-header">
                <AlertTriangle size={22} color="var(--warning)" />
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    Encryption Lab
                    <span style={{fontSize: '0.65rem', color: '#f59e0b', background: '#f59e0b20', padding: '2px 6px', borderRadius: 4, letterSpacing: '2px'}}>SIMULATION</span>
                </h2>
                <div className={`enc-status-bar ${status}`} style={{ marginLeft: 'auto', minWidth: 280 }}>
                    <span className="status-dot" />
                    <span>{statusText[status]}</span>
                </div>
            </div>

            {/* File browser + controls */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '18px 22px' }}>
                <input type="file" multiple id="encFileInput" style={{ display: 'none' }} onChange={handleFileChange} />
                <label htmlFor="encFileInput" className="upload-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FolderOpen size={14} /> Browse Files
                </label>

                {files.length > 0 && status === 'idle' && (
                    <button className="btn-ghost" onClick={startEncryption}>
                        <Lock size={13} /><span>Start Encryption</span>
                    </button>
                )}

                {status === 'encrypting' && (
                    <button className="btn-warning" onClick={haltEncryption}>
                        <StopCircle size={13} /><span>Halt Encryption</span>
                    </button>
                )}

                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
                    {files.length > 0 ? `${files.length} file(s) loaded` : 'No files selected'}
                </span>
            </div>

            {/* Threshold progress bar */}
            {files.length > 0 && (
                <div className="enc-threshold-bar">
                    <div className="enc-threshold-label">
                        <span>Encryption Threshold</span>
                        <span style={{ color: thresholdColor }}>{Math.round(thresholdPct)}% ({threshold}/{THRESHOLD_COUNT} files)</span>
                    </div>
                    <div className="enc-threshold-track">
                        <div className="enc-threshold-fill" style={{ width: `${thresholdPct}%`, background: thresholdColor }} />
                    </div>
                </div>
            )}

            {/* Main grid: file list + console */}
            {files.length > 0 && (
                <div className="enc-grid">
                    {/* File list */}
                    <div className="enc-file-list card" style={{ padding: 0 }}>
                        <div className="enc-file-header">File Traversal — {files.length} paths</div>
                        {files.map((f, i) => {
                            const fs = fileStates[f.name] || { state: 'plain' };
                            return (
                                <div key={i} className={`enc-file-item ${fs.state === 'encrypted' ? 'encrypted' : fs.state === 'decrypted' ? 'decrypted' : ''}`}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {fs.state === 'encrypted' ? fs.scrambled : f.name}
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {(f.size / 1024).toFixed(1)} KB
                                    </span>
                                    <span className={`enc-badge ${fs.state}`}>{fs.state}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Console log */}
                    <div className="enc-console card" style={{ padding: 0 }}>
                        <div className="enc-console-header">
                            <Terminal size={13} /> Encryption Console
                        </div>
                        <div className="enc-console-body" ref={consRef}>
                            {consoleLogs.length === 0 && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{'> awaiting input...'}</span>
                            )}
                            {consoleLogs.map((l, i) => (
                                <div key={i} className={`enc-log-line ${l.type}`}>
                                    <span className="ts">[{l.ts}]</span>
                                    <span className="msg">{l.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Decrypt panel — shown after halt or done */}
            {(status === 'halted' || status === 'done' || status === 'decrypting' || status === 'decrypted') && (
                <div className="decrypt-panel">
                    <p className="section-label"><Unlock size={13} /> Decrypt Files</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 8, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.7 }}>
                        Enter the decryption key to restore encrypted files to the connected hard disk.
                        <br />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>[HINT: {ENCRYPTION_KEY}]</span>
                    </p>
                    <div className="decrypt-input-row">
                        <input
                            type="text"
                            className="decrypt-key-input"
                            placeholder="Enter decryption key..."
                            value={keyInput}
                            onChange={e => { setKeyInput(e.target.value); setKeyError(''); }}
                            disabled={status === 'decrypting' || status === 'decrypted'}
                        />
                        <button
                            className="btn-ghost"
                            style={{ whiteSpace: 'nowrap' }}
                            onClick={decryptFiles}
                            disabled={status === 'decrypting' || status === 'decrypted'}
                        >
                            <Unlock size={13} /><span>Decrypt</span>
                        </button>
                    </div>
                    {keyError && <div className="login-error">{keyError}</div>}
                    {status === 'decrypted' && (
                        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', color: 'var(--success)', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
                            ✓ FILES SAFELY WRITTEN TO CONNECTED DRIVE — AUDIT LOG RECORDED IN MYSQL
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default EncryptionLab;
