import { useEffect, useState, useRef } from "react";
import { Outlet } from "react-router-dom";
import { LogOut, X, AlertTriangle, Bell } from "lucide-react";
import { io } from "socket.io-client";
import NavigationSidebar from "./NavigationSidebar";
import authApi from "../services/authApi";
import { formatDeviceTime } from "../utils/deviceTime";

// Double-chime chime using Web Audio API
const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    
    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    
    const now = audioCtx.currentTime;
    playTone(880, now, 0.35);       // A5
    playTone(1046.5, now + 0.12, 0.45); // C6
  } catch (err) {
    console.error("Audio playback failed:", err);
  }
};

const EVENT_MAPPINGS = {
  OBD_HARD_ACCELERATION: "Harsh Acceleration",
  HARD_ACCELERATION: "Harsh Acceleration",
  OBD_HARD_DECELERATION: "Harsh Braking",
  HARD_DECELERATION: "Harsh Braking",
  HARD_BRAKING: "Harsh Braking",
  OBD_SHARP_TURN: "Harsh Cornering",
  SHARP_TURN: "Harsh Cornering",
  SHARP_CORNERING: "Harsh Cornering",
  OBD_CRASH: "Collision / Crash Detected",
  CRASH: "Collision / Crash Detected",
  OBD_LOW_VOLTAGE: "Low Battery Voltage",
  LOW_VOLTAGE: "Low Battery Voltage",
  OBD_ENGINE_TEMP: "High Engine Temperature",
  SPEEDING: "Speeding Violation",
  OVER_SPEED: "Speeding Violation",
  OBD_MIL: "Engine Diagnostics (MIL Warning)",
  MIL_ON: "Engine Diagnostics (MIL Warning)",
  POWER_OFF: "Device Disconnected (Power Loss)",
  OBD_POWER_OFF: "Device Disconnected (Power Loss)",
  PULL_OUT: "Device Tampered / Pulled Out",
  OBD_PULL_OUT: "Device Tampered / Pulled Out",
  GEOFENCE_ENTER: "Geofence Entry",
  GEOFENCE_EXIT: "Geofence Exit",
  IGNITION_ON: "Ignition Turned On",
  IGNITION_OFF: "Ignition Turned Off",
  TOWING: "Towing / Unauthorized Movement",
  TOW: "Towing / Unauthorized Movement",
  VIBRATION: "Vibration Alert (Unusual Activity)",
  SHAKE: "Vibration Alert (Unusual Activity)",
};

const formatEventType = (type) => {
  if (!type) return "Unknown Alert";
  const upper = type.toUpperCase().trim();
  if (EVENT_MAPPINGS[upper]) {
    return EVENT_MAPPINGS[upper];
  }
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const Toast = ({ toast, onClose }) => {
  // Use a ref to store the latest onClose callback to prevent timer resets
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  const severityColors = {
    CRITICAL: { bg: "#7f1d1d", border: "#ef4444", text: "#fee2e2", accent: "#ef4444" },
    HIGH: { bg: "#7c2d12", border: "#f97316", text: "#ffedd5", accent: "#f97316" },
    NORMAL: { bg: "#0f172a", border: "#0ea5e9", text: "#e0f2fe", accent: "#0ea5e9" },
    LOW: { bg: "#0f172a", border: "#38bdf8", text: "#e0f2fe", accent: "#38bdf8" },
  };

  const style = severityColors[String(toast.severity).toUpperCase()] || severityColors.NORMAL;

  return (
    <div
      style={{
        background: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: "12px",
        padding: "16px",
        color: style.text,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)",
        minWidth: "320px",
        maxWidth: "420px",
        position: "relative",
        animation: "toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        backdropFilter: "blur(8px)",
        pointerEvents: "auto",
        transition: "all 0.2s ease",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          opacity: 0.6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px",
          borderRadius: "50%",
          transition: "opacity 0.2s",
          pointerEvents: "auto",
        }}
        onMouseOver={e => e.currentTarget.style.opacity = 1}
        onMouseOut={e => e.currentTarget.style.opacity = 0.6}
      >
        <X size={16} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ color: style.accent, display: "flex" }}>
          <AlertTriangle size={20} />
        </div>
        <div style={{ fontWeight: "800", fontSize: "14px", letterSpacing: "0.5px" }}>
          {toast.title}
        </div>
      </div>

      <div style={{ fontSize: "12px", opacity: 0.95, lineHeight: "1.4" }}>
        {toast.message}
      </div>

      <div style={{ fontSize: "10px", opacity: 0.6, alignSelf: "flex-end", marginTop: "4px", fontWeight: "600" }}>
        {toast.time}
      </div>
    </div>
  );
};

export default function Layout({ theme, toggleTheme }) {
  const [toasts, setToasts] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    // Get token
    const userStr = localStorage.getItem("user");
    let token = null;
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        token = user.accessToken || user.token;
      } catch (e) {
        console.error("❌ Failed to parse user token for alert socket:", e);
      }
    }

    // Determine target URL and path
    const serverType = import.meta.env.VITE_SERVER_TYPE;
    let socketUrl = "";
    let socketPath = "";

    if (serverType === "new") {
      socketUrl = import.meta.env.VITE_BACKEND_IP || import.meta.env.VITE_API_BASE_URL;
      socketPath = "/socket.io";
    } else {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
      try {
        const parsed = new URL(apiBaseUrl);
        socketUrl = `${parsed.protocol}//${parsed.host}`;
        const basePath = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/\/$/, "") : "";
        socketPath = `${basePath}/socket.io`;
      } catch {
        socketUrl = apiBaseUrl;
        socketPath = "/socket.io";
      }
    }

    console.log(`🔌 Connecting to system alert socket: ${socketUrl} (path: ${socketPath})`);

    const socket = io(socketUrl, {
      path: socketPath,
      reconnectionAttempts: 10,
      auth: token ? { token } : undefined,
      transports: ["polling"],
    });

    socketRef.current = socket;

    const handleNewAlert = (alert) => {
      console.log("🔔 Real-time alert received:", alert);
      
      const newToastId = alert.id || Date.now() + Math.random();
      
      setToasts(prev => {
        // Prevent duplicate toasts if id is the same or if an identical message exists recently
        const isDuplicate = prev.some(t => t.id === alert.id || t.id === newToastId);
        if (isDuplicate) return prev;

        // If not duplicate, play sound only once
        playNotificationSound();

        const newToast = {
          id: newToastId,
          title: alert.alertPolicyName || formatEventType(alert.eventType),
          message: `Device ${alert.deviceId || "unknown"} triggered ${formatEventType(alert.eventType)} (Vehicle: ${alert.licensePlate || "N/A"})`,
          severity: alert.severity || "NORMAL",
          time: formatDeviceTime(alert.eventTime || Date.now()),
        };

        return [newToast, ...prev].slice(0, 5); // Keep last 5 toasts
      });
    };

    socket.on("connect", () => {
      console.log("✅ System alert socket connected successfully.");
      socket.emit("alert:subscribe");
    });

    // The backend might emit both events, causing duplicates if not handled.
    socket.on("alert_notification", handleNewAlert);
    socket.on("alert:event", handleNewAlert);

    socket.on("connect_error", (error) => {
      console.warn("⚠️ System alert socket connection error:", error.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className={`app-main-layout ${theme}`}>
      <NavigationSidebar theme={theme} toggleTheme={toggleTheme} />
      
      {/* Top Right Logout Button */}
      <button 
        className="top-right-logout"
        onClick={() => { authApi.logout(); window.location.reload(); }}
        title="Sign Out System"
      >
        <LogOut size={20} />
        <span>Sign Out</span>
      </button>

      {/* Toast Notification Stack */}
      <div
        style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          pointerEvents: "none",
        }}
      >
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            toast={toast}
            onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
          />
        ))}
      </div>

      {/* Global Toast Styles */}
      <style>
        {`
          @keyframes toastSlideIn {
            from {
              transform: translateX(120%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>

      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}
