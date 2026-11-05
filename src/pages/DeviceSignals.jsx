import React, { useState, useEffect, useRef } from "react";
import { Activity, Radio, HardDrive, RefreshCw, Download, Search, ArrowDownLeft, ArrowUpRight, Zap, ShieldAlert, ChevronDown, X } from "lucide-react";
import "./Logs.css";

const API_BASE_URL = import.meta.env.VITE_DASHCAM_API_URL || import.meta.env.VITE_LOGS_API_URL || "http://localhost:8000";
const API_BASE = `${API_BASE_URL}/api`;

export default function DeviceSignals({ theme }) {
  const [selectedType, setSelectedType] = useState("dashcam");
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState("");
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const deviceDropdownRef = useRef(null);
  const autoRefreshTimerRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (deviceDropdownRef.current && !deviceDropdownRef.current.contains(e.target)) {
        setIsDeviceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchDevices(selectedType);
  }, [selectedType]);

  useEffect(() => {
    if (selectedDevice) {
      fetchSignals(selectedDevice);
    } else {
      setSignals([]);
    }
  }, [selectedDevice]);

  // Polling / Auto-refresh every 3s if enabled and device selected
  useEffect(() => {
    if (autoRefresh && selectedDevice) {
      autoRefreshTimerRef.current = setInterval(() => {
        fetchSignalsSilent(selectedDevice);
      }, 3000);
    }
    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    };
  }, [autoRefresh, selectedDevice]);

  const fetchDevices = async (type) => {
    try {
      setLoading(true);
      setError("");
      setDevices([]);
      setSelectedDevice("");
      setSignals([]);

      const response = await fetch(`${API_BASE}/device-signals/devices?deviceType=${type}`);
      const data = await response.json();
      if (data.success && Array.isArray(data.devices)) {
        setDevices(data.devices);
        if (data.devices.length > 0) {
          setSelectedDevice(data.devices[0]);
        }
      }
    } catch (err) {
      setError("Failed to fetch active devices from Kafka/Redis");
    } finally {
      setLoading(false);
    }
  };

  const fetchSignals = async (deviceId) => {
    if (!deviceId) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API_BASE}/device-signals/${deviceId}?limit=300&deviceType=${selectedType}`);
      const data = await response.json();
      if (data.success) {
        setSignals(data.signals || []);
      }
    } catch (err) {
      setError("Failed to fetch device signals from Kafka/Redis");
    } finally {
      setLoading(false);
    }
  };

  const fetchSignalsSilent = async (deviceId) => {
    if (!deviceId) return;
    try {
      const response = await fetch(`${API_BASE}/device-signals/${deviceId}?limit=300&deviceType=${selectedType}`);
      const data = await response.json();
      if (data.success) {
        setSignals(data.signals || []);
      }
    } catch (_err) {
      // Keep silent for poll
    }
  };

  const filteredSignals = signals.filter((sig) => {
    if (filterAction !== "ALL" && sig.action !== filterAction) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (sig.hex && sig.hex.toLowerCase().includes(term)) ||
      (sig.action && sig.action.toLowerCase().includes(term)) ||
      (sig.direction && sig.direction.toLowerCase().includes(term)) ||
      (sig.description && sig.description.toLowerCase().includes(term)) ||
      (sig.protocol && sig.protocol.toLowerCase().includes(term))
    );
  });

  const downloadSignals = () => {
    const content = filteredSignals
      .map(
        (s) =>
          `[${s.timestamp}] [${s.protocol || "TCP"}] [${s.direction || "IN"}] [${s.action || "DATA"}] ${s.hex || s.description || ""
          }`
      )
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signals_${selectedType}_${selectedDevice}_${new Date().toISOString()}.log`;
    a.click();
  };

  return (
    <div className="logs-page">
      <div className="logs-header">
        <div className="logs-header-left">
          <div className="logs-icon-wrapper" style={{ background: "#0ea5e9" }}>
            <Radio size={24} color="#fff" />
          </div>
          <div className="logs-title">
            <h1>Device Raw Signals (Kafka)</h1>
            <p>Real-time packet signals (IN / OUT / CONNECT / DISCONNECT) streamed from Kafka</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Live Auto-Refresh (3s)
          </label>
          <button
            onClick={() => selectedDevice ? fetchSignals(selectedDevice) : fetchDevices(selectedType)}
            disabled={loading}
            className="refresh-btn"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError("")} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      <div className="logs-controls">
        <div className="logs-card">
          <div className="logs-row">
            <div className="form-group flex-1">
              <label><Zap size={14} /> Device Type</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="logs-select"
              >
                <option value="dashcam">AI Dashcam</option>
                <option value="obd">OBD Device</option>
                <option value="j42">J42 Tracker</option>
              </select>
            </div>

            <div className="form-group flex-1" ref={deviceDropdownRef} style={{ position: "relative" }}>
              <label><HardDrive size={14} /> Active Devices (Kafka Stream)</label>
              <div
                onClick={() => setIsDeviceDropdownOpen((prev) => !prev)}
                className="logs-select"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedDevice === "all"
                    ? `⚡ All ${selectedType.toUpperCase()} Devices (Kafka Live Stream)`
                    : (selectedDevice || (devices.length > 0 ? "-- Select Device --" : "-- No active devices --"))}
                </span>
                <ChevronDown size={16} color="#64748b" style={{ transform: isDeviceDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </div>

              {isDeviceDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "6px",
                    backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff",
                    border: "1px solid",
                    borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    maxHeight: "260px",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "8px", borderBottom: `1px solid ${theme === "dark" ? "#334155" : "#e2e8f0"}` }}>
                    <div style={{ position: "relative" }}>
                      <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                      <input
                        type="text"
                        placeholder="Search device ID / IMEI..."
                        value={deviceSearchTerm}
                        onChange={(e) => setDeviceSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        style={{
                          width: "100%",
                          padding: "6px 8px 6px 30px",
                          borderRadius: "6px",
                          border: `1px solid ${theme === "dark" ? "#475569" : "#cbd5e1"}`,
                          fontSize: "13px",
                          backgroundColor: theme === "dark" ? "#0f172a" : "#f8fafc",
                          color: theme === "dark" ? "#ffffff" : "#0f172a",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ overflowY: "auto", flex: 1 }}>
                    {/* ALL Devices Option */}
                    <div
                      onClick={() => {
                        setSelectedDevice("all");
                        setIsDeviceDropdownOpen(false);
                        setDeviceSearchTerm("");
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "600",
                        borderBottom: `1px solid ${theme === "dark" ? "#334155" : "#e2e8f0"}`,
                        backgroundColor: selectedDevice === "all" ? (theme === "dark" ? "#2563eb" : "#3b82f6") : "transparent",
                        color: selectedDevice === "all" ? "#ffffff" : (theme === "dark" ? "#38bdf8" : "#0284c7"),
                        transition: "background 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onMouseEnter={(e) => {
                        if (selectedDevice !== "all") {
                          e.currentTarget.style.backgroundColor = theme === "dark" ? "#334155" : "#f1f5f9";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedDevice !== "all") {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      ⚡ All {selectedType.toUpperCase()} Devices (Aggregated Stream)
                    </div>

                    {devices
                      .filter((dev) => !deviceSearchTerm || String(dev).toLowerCase().includes(deviceSearchTerm.toLowerCase()))
                      .map((dev) => (
                        <div
                          key={dev}
                          onClick={() => {
                            setSelectedDevice(dev);
                            setIsDeviceDropdownOpen(false);
                            setDeviceSearchTerm("");
                          }}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontFamily: "monospace",
                            backgroundColor: selectedDevice === dev ? (theme === "dark" ? "#2563eb" : "#3b82f6") : "transparent",
                            color: selectedDevice === dev ? "#ffffff" : (theme === "dark" ? "#e2e8f0" : "#1e293b"),
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            if (selectedDevice !== dev) {
                              e.currentTarget.style.backgroundColor = theme === "dark" ? "#334155" : "#f1f5f9";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedDevice !== dev) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          {dev}
                        </div>
                      ))}
                    {devices.filter((dev) => !deviceSearchTerm || String(dev).toLowerCase().includes(deviceSearchTerm.toLowerCase())).length === 0 && (
                      <div style={{ padding: "12px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                        No matching devices found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="logs-card">
          <div className="logs-row">
            <div className="form-group flex-1">
              <label><Activity size={14} /> Filter Signal Type</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="logs-select"
              >
                <option value="ALL">All Signals</option>
                <option value="DATA">Data Packets (IN/OUT)</option>
                <option value="CONNECT">Connection Events</option>
                <option value="DISCONNECT">Disconnection Events</option>
              </select>
            </div>

            <div className="form-group flex-1">
              <label><Search size={14} /> Search Hex / Info</label>
              <input
                type="text"
                placeholder="Search hex bytes, timestamp..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="logs-input"
              />
            </div>
          </div>
          <button
            onClick={downloadSignals}
            disabled={filteredSignals.length === 0}
            className="download-btn"
            style={{ marginTop: "10px" }}
          >
            <Download size={18} />
            Export Captured Signals ({filteredSignals.length})
          </button>
        </div>
      </div>

      <div className="logs-viewer-container">
        <div className="logs-viewer-header">
          <span>Signal Feed ({filteredSignals.length} records)</span>
          {selectedDevice && (
            <span>
              Device: <strong>{selectedDevice === "all" ? `ALL ${selectedType.toUpperCase()}` : selectedDevice}</strong>
            </span>
          )}
        </div>
        <div className="logs-viewport" style={{ maxHeight: "600px", overflowY: "auto", fontFamily: "monospace" }}>
          {filteredSignals.length > 0 ? (
            filteredSignals.map((item, idx) => {
              const isConnect = item.action === "CONNECT";
              const isDisconnect = item.action === "DISCONNECT";
              const isOut = item.direction === "OUT";

              let badgeColor = "#10b981"; // green for incoming
              if (isOut) badgeColor = "#3b82f6"; // blue for outgoing
              if (isConnect) badgeColor = "#eab308"; // yellow for connect
              if (isDisconnect) badgeColor = "#ef4444"; // red for disconnect

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "6px 8px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    fontSize: "13px",
                    lineHeight: "1.5",
                  }}
                >
                  <span style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>
                    [{item.timestamp ? item.timestamp.replace("T", " ").replace("Z", "") : ""}]
                  </span>
                  <span
                    style={{
                      backgroundColor: badgeColor,
                      color: "#fff",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.protocol || "TCP"} {item.direction} {item.action}
                  </span>
                  <span style={{ wordBreak: "break-all", color: isConnect || isDisconnect ? "#fbbf24" : "#e5e7eb" }}>
                    {item.hex ? item.hex : item.description || ""}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="placeholder-text">
              {loading
                ? "Connecting to Kafka signals..."
                : selectedDevice
                  ? "No signals captured for this device yet. Send packets or connect the tracker to see signals."
                  : "Select an active device above to stream signals"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

