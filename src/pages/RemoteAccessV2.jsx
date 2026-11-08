import { useState, useEffect, useRef } from 'react';
import { MonitorSmartphone, Link2, RefreshCw, CheckCircle2, AlertCircle, Copy, ExternalLink, Radio, RotateCcw } from 'lucide-react';
import deviceApi from '../services/deviceApi';

export default function RemoteAccessV2() {
    const [devices, setDevices] = useState({ active: [], historical: [] });
    const [selectedDevice, setSelectedDevice] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // { url, deviceId }
    const [notification, setNotification] = useState(null);
    const [copied, setCopied] = useState(false);
    const [tunnelAge, setTunnelAge] = useState(0); // seconds since tunnel established
    const [legacy, setLegacy] = useState(false);
    const timerRef = useRef(null);

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const fetchDevices = async () => {
        try {
            const res = await deviceApi.checkStatus();
            if (res.success) {
                const active = Object.keys(res.activeConnections || []);
                const lastSeen = Object.keys(res.lastSeenDevices || []);
                const historical = lastSeen.filter(id => !active.includes(id));
                setDevices({ active, historical });
            }
        } catch (err) {
            console.error('Status check failed', err);
        }
    };

    useEffect(() => { fetchDevices(); }, []);

    // Start/reset tunnel age timer whenever result changes
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (result) {
            setTunnelAge(0);
            timerRef.current = setInterval(() => setTunnelAge(s => s + 1), 1000);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [result]);

    const handleGenerate = async () => {
        if (!selectedDevice) return;
        setLoading(true);
        setResult(null);
        showNotification('Sending V2 wake-up command (Self-Hosted FRP) to camera...', 'info');
        try {
            const res = await deviceApi.triggerRemoteSettingsV2(selectedDevice, legacy);
            if (res.success) {
                setResult({ url: res.url, deviceId: selectedDevice });
                showNotification('V2 Tunnel established! Self-hosted routing link generated.', 'success');
            } else {
                showNotification(res.error || 'Failed to establish V2 tunnel.', 'error');
            }
        } catch (err) {
            showNotification(err.message || 'Connection failed. Is the camera online?', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleReconnect = async () => {
        await handleGenerate();
    };

    const fmtAge = (s) => {
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    };

    const handleCopy = () => {
        if (!result?.url) return;

        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(result.url)
                .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                })
                .catch(err => console.error("Clipboard copy failed:", err));
        } else {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = result.url;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                textArea.remove();
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error("Fallback copy failed:", err);
            }
        }
    };

    const isActive = devices.active.includes(selectedDevice);

    return (
        <div className="remote-access-page" style={{
            minHeight: '100vh',
            padding: '2rem',
            background: 'var(--bg-primary, #0f0f0f)',
            color: 'var(--text-primary, #f1f1f1)',
            fontFamily: 'inherit'
        }}>
            {/* Notification */}
            {notification && (
                <div style={{
                    position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '1rem 1.5rem', borderRadius: '12px',
                    background: notification.type === 'error' ? '#450a0a' : notification.type === 'info' ? '#0c2340' : '#052e16',
                    border: `1px solid ${notification.type === 'error' ? '#dc2626' : notification.type === 'info' ? '#3b82f6' : '#16a34a'}`,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    maxWidth: '380px',
                    animation: 'fadeIn 0.3s ease'
                }}>
                    {notification.type === 'error'
                        ? <AlertCircle size={18} color="#dc2626" />
                        : notification.type === 'info'
                            ? <Radio size={18} color="#3b82f6" />
                            : <CheckCircle2 size={18} color="#16a34a" />}
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>{notification.message}</p>
                </div>
            )}

            {/* Page Header */}
            <div style={{ maxWidth: '680px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 24px rgba(16,185,129,0.4)'
                    }}>
                        <MonitorSmartphone size={24} color="white" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                            Remote Camera Access V2
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', opacity: 0.5, fontWeight: 500 }}>
                            Generate a secure self-hosted FRP link using raw server IP and port 7001
                        </p>
                    </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '1.5rem 0' }} />

                {/* How it works */}
                <div style={{
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
                    fontSize: '13px', lineHeight: '1.6', opacity: 0.85
                }}>
                    <strong style={{ color: '#6ee7b7' }}>Version 2 (Self-Hosted):</strong> Selecting a device and clicking{' '}
                    <em>Generate V2 Link</em> sends a JT808 wake-up command configured with our self-hosted FRP server. 
                    This bypasses cellular APN firewalls and DNS resolution failures, establishing a direct connection to our VPS.
                </div>

                {/* Device Selector Card */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px', padding: '1.5rem', marginBottom: '1.25rem'
                }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, opacity: 0.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                        Select Device
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                            value={selectedDevice}
                            onChange={e => { setSelectedDevice(e.target.value); setResult(null); }}
                            style={{
                                flex: 1, minWidth: '200px', background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
                                padding: '0.75rem 1rem', color: 'inherit', fontSize: '14px',
                                fontWeight: 600, outline: 'none', cursor: 'pointer'
                            }}
                        >
                            <option value="">— Select a camera terminal —</option>
                            <optgroup label="🟢 Live Connections">
                                {devices.active.map(id => (
                                    <option key={id} value={id}>{id}</option>
                                ))}
                            </optgroup>
                            <optgroup label="⚪ Last Seen (Offline)">
                                {devices.historical.map(id => (
                                    <option key={id} value={id}>{id}</option>
                                ))}
                            </optgroup>
                        </select>

                        {selectedDevice && (
                            <span style={{
                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                                padding: '0.3rem 0.75rem', borderRadius: '20px',
                                background: isActive ? 'rgba(22,163,74,0.15)' : 'rgba(100,100,100,0.15)',
                                border: `1px solid ${isActive ? 'rgba(22,163,74,0.4)' : 'rgba(100,100,100,0.3)'}`,
                                color: isActive ? '#4ade80' : '#888'
                            }}>
                                {isActive ? '● LIVE' : '○ OFFLINE'}
                            </span>
                        )}
                    </div>

                    {selectedDevice && !isActive && (
                        <p style={{ margin: '0.75rem 0 0', fontSize: '12px', color: '#f59e0b', opacity: 0.8 }}>
                            ⚠ This device is offline. The camera may not respond to the wake-up command.
                        </p>
                    )}

                    {/* Legacy mode checkbox */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                        <input
                            type="checkbox"
                            id="legacy-mode"
                            checked={legacy}
                            onChange={e => setLegacy(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="legacy-mode" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #f1f1f1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            Use Legacy FRP Version (for older camera firmware)
                        </label>
                    </div>
                </div>

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    disabled={loading || !selectedDevice}
                    style={{
                        width: '100%', padding: '1rem', borderRadius: '12px',
                        background: loading || !selectedDevice
                            ? 'rgba(255,255,255,0.06)'
                            : 'linear-gradient(135deg, #10b981, #3b82f6)',
                        border: 'none', color: 'white', fontSize: '15px', fontWeight: 800,
                        letterSpacing: '-0.01em', cursor: loading || !selectedDevice ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                        transition: 'all 0.2s ease', opacity: loading || !selectedDevice ? 0.5 : 1,
                        marginBottom: '1.5rem',
                        boxShadow: loading || !selectedDevice ? 'none' : '0 8px 24px rgba(16,185,129,0.35)'
                    }}
                >
                    {loading
                        ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Establishing V2 Tunnel...</>
                        : <><Link2 size={18} /> Generate V2 Login Link</>
                    }
                </button>

                {/* Result Card */}
                {result && (
                    <>
                        <div style={{
                            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                            borderRadius: '16px', padding: '1.5rem',
                            animation: 'fadeIn 0.4s ease', marginBottom: '1.25rem'
                        }}>
                            {/* Status row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                <CheckCircle2 size={18} color="#34d399" />
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#34d399', letterSpacing: '0.04em', flex: 1 }}>
                                    SELF-HOSTED V2 TUNNEL ACTIVE — {result.deviceId}
                                </span>
                                {/* Age badge — turns amber after 60s as warning */}
                                <span style={{
                                    fontSize: '11px', fontWeight: 700, padding: '0.25rem 0.65rem',
                                    borderRadius: '20px',
                                    background: tunnelAge > 60 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                                    border: `1px solid ${tunnelAge > 60 ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.3)'}`,
                                    color: tunnelAge > 60 ? '#fbbf24' : '#34d399'
                                }}>
                                    ⏱ {fmtAge(tunnelAge)}
                                </span>
                                {/* Reconnect button */}
                                <button
                                    onClick={handleReconnect}
                                    disabled={loading}
                                    title="Re-send V2 #FRPSET command and reload"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                                        padding: '0.3rem 0.75rem', borderRadius: '8px', border: 'none',
                                        background: 'rgba(16,185,129,0.15)', color: '#a7f3d0',
                                        fontSize: '12px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                                        opacity: loading ? 0.5 : 1
                                    }}
                                >
                                    <RotateCcw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
                                    Reconnect V2
                                </button>
                            </div>

                            {/* URL row */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                background: 'rgba(0,0,0,0.3)', borderRadius: '10px',
                                padding: '0.75rem 1rem',
                                border: '1px solid rgba(255,255,255,0.08)'
                            }}>
                                <code style={{ flex: 1, fontSize: '13px', fontWeight: 600, wordBreak: 'break-all', color: '#a7f3d0' }}>
                                    {result.url}
                                </code>
                                <button onClick={handleCopy} title="Copy link" style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px', padding: '0.4rem 0.6rem', cursor: 'pointer',
                                    color: copied ? '#34d399' : 'inherit', transition: 'all 0.2s', flexShrink: 0
                                }}>
                                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                </button>
                                <a href={result.url} target="_blank" rel="noreferrer" title="Open in new tab" style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px', padding: '0.4rem 0.6rem', cursor: 'pointer',
                                    color: 'inherit', display: 'flex', alignItems: 'center',
                                    textDecoration: 'none', flexShrink: 0
                                }}>
                                    <ExternalLink size={16} />
                                </a>
                            </div>

                            {tunnelAge > 60 && (
                                <p style={{ margin: '0.75rem 0 0', fontSize: '12px', color: '#fbbf24', opacity: 0.85 }}>
                                    ⚠ Tunnel has been active for {fmtAge(tunnelAge)}. If the page errors, click Reconnect V2.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                select option { background: #1a1a2e; color: #f1f1f1; }
            `}</style>
        </div>
    );
}
