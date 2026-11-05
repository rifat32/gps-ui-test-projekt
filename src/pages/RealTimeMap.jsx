import { useEffect, useRef, useState } from "react";
import {
  GoogleMap,
  LoadScript,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { Loader2, Bell, ChevronDown, Search, Shield, X, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";

import deviceApi from "../services/deviceApi";
import { formatToLocalTime, parseToEpochMs as getMillis } from "../utils/deviceTime";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAP_API;
const WS_URL_DASHCAM = import.meta.env.VITE_DASHCAM_WS_URL || import.meta.env.VITE_WS_URL;
const WS_URL_OBD = import.meta.env.VITE_OBD_API_URL;

const mapContainerStyle = { width: "100%", height: "100vh" };
const defaultCenter = { lat: 51.5074, lng: -0.1278 };

const normalizeId = (value) => String(value || "").replace(/^device[_:-]/i, "");

const getBatteryDisplay = (voltage, deviceType, rawVoltage = null) => {
  if (voltage === undefined || voltage === null || voltage === "") return "N/A";
  const val = parseFloat(voltage);
  if (isNaN(val) || val <= 0) return "N/A";

  if (deviceType === "OBD") {
    return `${val.toFixed(2)}V`;
  }

  // J42 device uses Li-SOCl2 3.6V nominal dry-cell (official range 2.4V - 3.6V) or rechargeable (range 3.0V - 4.2V)
  let percent = 0;
  let displayVolts = "";
  if (val > 5.0) {
    percent = Math.round(val);
    if (rawVoltage && parseFloat(rawVoltage) > 0) {
      displayVolts = ` (${parseFloat(rawVoltage).toFixed(3)}V)`;
    }
  } else {
    if (val >= 3.65) {
      percent = Math.round(((val - 3.0) / (4.2 - 3.0)) * 100);
    } else {
      percent = Math.round(((val - 2.4) / (3.6 - 2.4)) * 100);
    }
    displayVolts = ` (${val.toFixed(3)}V)`;
  }

  percent = Math.max(0, Math.min(100, percent));
  return `${percent}%${displayVolts}`;
};




const MOVING_SPEED_THRESHOLD = Number(import.meta.env.VITE_LIVE_DEVICE_MOVING_SPEED_THRESHOLD || 1);

const formatStatus = (status, speed, isDashcam = false) => {
  const normalized = String(status || "").toUpperCase();
  const hasSpeed = speed !== undefined && speed !== null && speed !== "";
  const numericSpeed = Number(speed);

  if (normalized === "OFFLINE") return "Offline";
  if (normalized === "MOVING") return "Moving";
  if (normalized === "STOPPED") {
    return isDashcam ? "Idle" : "Stopped";
  }
  if (normalized === "IDLE") return "Idle";

  if (normalized === "ONLINE") {
    if (hasSpeed && Number.isFinite(numericSpeed)) {
      if (numericSpeed > MOVING_SPEED_THRESHOLD) return "Moving";
      return isDashcam ? "Idle" : "Stopped";
    }
    return "Online";
  }

  if (hasSpeed && Number.isFinite(numericSpeed)) {
    if (numericSpeed > MOVING_SPEED_THRESHOLD) return "Moving";
    return isDashcam ? "Idle" : "Stopped";
  }

  return "Online";
};

const mapApiVehicle = (v) => {
  const id = normalizeId(v.device_id || v.deviceId || v.id);
  const lat = Number(v.latitude ?? v.lat ?? 0);
  const lng = Number(v.longitude ?? v.lng ?? v.lon ?? 0);

  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const speed = Number(v.speed || 0);
  const lastSeen = v.last_seen || v.lastSeen || v.lastSeenAt || v.received_at || v.receivedAt || v.timestamp || null;
  const gpsTime = v.gps_time || v.gpsTime || v.time || v.timestamp || null;
  const devType = v.device_type || v.type || "";

  const isDash = String(devType).toUpperCase().includes("DASHCAM");
  let resolvedStatus = formatStatus(v.liveStatus || v.status, speed, isDash);

  return {
    id,
    name: v.deviceName || v.name || id,
    lat,
    lng,
    speed,
    heading: Number(v.direction ?? v.heading ?? 0),
    status: resolvedStatus,
    timestamp: gpsTime,
    gpsTime,
    lastSeen,
    lastUpdatedAt: getMillis(lastSeen) || Date.now(),
    deviceType: devType,
    batteryVoltage: v.battery_voltage ?? v.batteryVoltage ?? v.bettary ?? null,
    externalVoltage: v.external_voltage ?? v.externalVoltage ?? null,
    isRealDevice: !!(v.isRealDevice ?? v.is_real_device),
    lastEngineOn: v.lastEngineOn || null,
  };
};


const mapSocketVehicle = (update) => {
  const id = normalizeId(update.deviceId || update.device_id || update.id);
  const lat = Number(update.latitude ?? update.lat ?? 0);
  const lng = Number(update.longitude ?? update.lng ?? update.lon ?? 0);

  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const speed = Number(update.speed || 0);
  const lastSeen = update.receivedAt || update.received_at || update.lastSeen || update.lastSeenAt || new Date().toISOString();
  const gpsTime = update.gpsTime || update.gps_time || update.time || null;
  const devType = update.deviceType || update.device_type || "OBD";

  const isDash = String(devType).toUpperCase().includes("DASHCAM");
  let resolvedStatus = formatStatus(update.liveStatus || update.status, speed, isDash);

  return {
    id,
    name: update.name || update.deviceName || id,
    lat,
    lng,
    speed,
    heading: Number(update.direction ?? update.heading ?? 0),
    status: resolvedStatus,
    timestamp: gpsTime,
    gpsTime,
    lastSeen,
    lastUpdatedAt: getMillis(gpsTime) || getMillis(lastSeen) || Date.now(),
    deviceType: devType,
    batteryVoltage: update.batteryVoltage ?? update.battery_voltage ?? update.bettary ?? null,
    externalVoltage: update.externalVoltage ?? update.external_voltage ?? null,
    lastEngineOn: update.lastEngineOn || null,
  };
};

export default function RealTimeMap({ deviceType = "AI_DASHCAM", showRealOnly: initialShowRealOnly = false }) {
  const currentWsUrl = deviceType === "OBD" ? WS_URL_OBD : WS_URL_DASHCAM;

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRealOnly, setShowRealOnly] = useState(initialShowRealOnly);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);

  const mapRef = useRef(null);
  const socketRef = useRef(null);
  const alertsSocketRef = useRef(null);
  const realDeviceIdsRef = useRef(new Set()); // Set of deviceId strings that are real
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDeviceDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    setResolvedAddress("");
  }, [selectedVehicle]);

  const handleShowAddress = async () => {
    if (!selectedVehicle) return;
    setResolvedAddress("Loading...");
    setIsGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${selectedVehicle.lat}&lon=${selectedVehicle.lng}&format=jsonv2`,
        {
          headers: {
            "User-Agent": "FleetManagement/1.0"
          }
        }
      );
      if (!response.ok) throw new Error("Failed to fetch address");
      const data = await response.json();
      setResolvedAddress(data.display_name || `${parseFloat(selectedVehicle.lat).toFixed(6)}, ${parseFloat(selectedVehicle.lng).toFixed(6)}`);
    } catch (e) {
      console.warn("Geocoding failed:", e);
      setResolvedAddress(`${parseFloat(selectedVehicle.lat).toFixed(6)}, ${parseFloat(selectedVehicle.lng).toFixed(6)}`);
    } finally {
      setIsGeocoding(false);
    }
  };

  const mergeVehicle = (incoming) => {
    if (!incoming) return;

    setVehicles((prev) => {
      const index = prev.findIndex((v) => normalizeId(v.id) === incoming.id);
      if (index === -1) {
        const incomingType = String(incoming.deviceType || "").toUpperCase();
        if (incomingType !== String(deviceType).toUpperCase()) return prev;
        return [...prev, incoming];
      }

      const existing = prev[index];
      const existingGps = getMillis(existing.gpsTime);
      const incomingGps = getMillis(incoming.gpsTime);
      if (existingGps && incomingGps) {
        if (incomingGps < existingGps) return prev;
      } else {
        const existingTime = existingGps || existing.lastUpdatedAt || getMillis(existing.lastSeen);
        const incomingTime = incomingGps || incoming.lastUpdatedAt || getMillis(incoming.lastSeen);
        if (existingTime && incomingTime && incomingTime < existingTime) return prev;
      }

      const next = [...prev];
      const updatedLastEngineOn = (incoming.status === "Moving" || incoming.status === "Idle")
        ? (incoming.gpsTime || incoming.lastSeen || existing.lastEngineOn)
        : (incoming.lastEngineOn || existing.lastEngineOn);
      next[index] = { 
        ...existing, 
        ...incoming, 
        name: incoming.name || existing.name,
        lastEngineOn: updatedLastEngineOn 
      };
      return next;
    });

    setSelectedVehicle((current) => {
      if (!current || normalizeId(current.id) !== incoming.id) return current;

      const existingGps = getMillis(current.gpsTime);
      const incomingGps = getMillis(incoming.gpsTime);
      if (existingGps && incomingGps) {
        if (incomingGps < existingGps) return current;
      } else {
        const existingTime = existingGps || current.lastUpdatedAt || getMillis(current.lastSeen);
        const incomingTime = incomingGps || incoming.lastUpdatedAt || getMillis(incoming.lastSeen);
        if (existingTime && incomingTime && incomingTime < existingTime) return current;
      }

      const updatedLastEngineOn = (incoming.status === "Moving" || incoming.status === "Idle")
        ? (incoming.gpsTime || incoming.lastSeen || current.lastEngineOn)
        : (incoming.lastEngineOn || current.lastEngineOn);

      return { 
        ...current, 
        ...incoming, 
        name: incoming.name || current.name,
        lastEngineOn: updatedLastEngineOn 
      };
    });
  };

  const fetchInitialPositions = async () => {
    try {
      setError(null);

      // Fetch device registry to know which IDs are real
      try {
        const devRes = await deviceApi.getDevicesV2({ device_type: deviceType });
        const realIds = new Set(
          (devRes.data || []).filter(d => d.isRealDevice).map(d => normalizeId(d.deviceId || d.id))
        );
        realDeviceIdsRef.current = realIds;
      } catch (e) {
        console.warn("Could not fetch device registry for real-device filter:", e);
      }

      const json = await deviceApi.getLiveGpsData({ device_type: deviceType });
      const apiVehicles = (json.data || []).map(mapApiVehicle).filter(Boolean);
      setVehicles(apiVehicles);
    } catch (err) {
      console.error("Error fetching vehicles:", err);
      setError("Failed to load live GPS data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setVehicles([]);
    setSelectedVehicle(null);
    fetchInitialPositions();

    socketRef.current = import.meta.env.VITE_SERVER_TYPE === "new"
      ? io(currentWsUrl, {
        path: "/socket.io",
        transports: ["polling"],
      })
      : io(currentWsUrl);

    socketRef.current.on("connect", () => {
      console.log("Connected to Socket.io server. Syncing latest positions...");
      fetchInitialPositions();
    });

    socketRef.current.on("gps_update", (update) => {
      console.log("Received GPS update:", update);

      const incomingType = String(update.deviceType || update.device_type || "").toUpperCase();
      if (incomingType && incomingType !== String(deviceType).toUpperCase()) return;

      const vehicle = mapSocketVehicle(update);
      if (!vehicle) {
        console.warn("Discarding invalid GPS update:", update);
        return;
      }

      mergeVehicle(vehicle);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("Tab focused. Syncing latest positions...");
        fetchInitialPositions();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const stalenessInterval = setInterval(() => {
      const TEN_MINUTES = 10 * 60 * 1000;
      setVehicles((prev) =>
        prev.map((v) => {
          const lastUpdate = v.lastUpdatedAt || getMillis(v.lastSeen) || getMillis(v.gpsTime);
          const isStale = !lastUpdate || Date.now() - lastUpdate > TEN_MINUTES;
          if (isStale && String(v.status).toUpperCase() !== "OFFLINE") {
            return { ...v, status: "Offline" };
          }
          return v;
        })
      );
    }, 60000);

    // Fetch initial unread alerts count
    const fetchUnreadCount = async () => {
      try {
        const res = await deviceApi.getAlertEvents({ page: 1, perPage: 1, status: "UNREAD" });
        if (res && res.success && res.meta) {
          setUnreadAlertsCount(res.meta.total);
        }
      } catch (err) {
        console.error("Failed to fetch initial unread alerts count:", err);
      }
    };
    fetchUnreadCount();

    // Setup alerts socket for real-time counts
    let alertsSocketUrl = WS_URL_DASHCAM;
    let alertsSocketPath = "/socket.io";

    // Retrieve token for authentication
    const userStr = localStorage.getItem("user");
    let token = null;
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        token = user.accessToken || user.token;
      } catch (e) {
        console.error("Error parsing user for alerts socket:", e);
      }
    }

    const alertsSocket = io(alertsSocketUrl, {
      path: alertsSocketPath,
      reconnectionAttempts: 10,
      auth: token ? { token } : undefined,
      transports: ["polling"],
    });

    alertsSocketRef.current = alertsSocket;

    alertsSocket.on("connect", () => {
      alertsSocket.emit("alert:subscribe");
    });

    const handleSystemAlert = (alert) => {
      console.log("Real-time alert received on map:", alert);
      setUnreadAlertsCount((prev) => prev + 1);
    };

    alertsSocket.on("alert_notification", handleSystemAlert);
    alertsSocket.on("alert:event", handleSystemAlert);

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (alertsSocketRef.current) alertsSocketRef.current.disconnect();
      clearInterval(stalenessInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [deviceType, currentWsUrl]);

  useEffect(() => {
    if (vehicles.length > 0 && mapRef.current && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      let hasValidCoords = false;

      vehicles.forEach((v) => {
        if (Number.isFinite(v.lat) && Number.isFinite(v.lng) && v.lat !== 0 && v.lng !== 0) {
          bounds.extend({ lat: v.lat, lng: v.lng });
          hasValidCoords = true;
        }
      });

      if (hasValidCoords) {
        mapRef.current.fitBounds(bounds);
        if (vehicles.length === 1) {
          setTimeout(() => {
            if (mapRef.current) mapRef.current.setZoom(15);
          }, 100);
        }
      }
    }
  }, [vehicles.length]);

  // Derive the list of vehicles to render, filtered when showRealOnly is active
  const visibleVehicles = showRealOnly
    ? vehicles.filter(v => v.isRealDevice || realDeviceIdsRef.current.has(normalizeId(v.id)))
    : vehicles;

  const filteredVehiclesForDropdown = visibleVehicles.filter(v =>
    v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.name && v.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const markerColor = (status) => {
    const normalized = String(status).toUpperCase();
    if (normalized === "OFFLINE") return "#94a3b8";
    if (normalized === "MOVING") return "#22c55e";
    if (normalized === "STOPPED") return "#ef4444";
    return "#3b82f6";
  };

  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
      <div
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          backgroundColor: "#f8fafc",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: isMobile ? "0px" : "30px",
          boxSizing: "border-box"
        }}
      >
        {/* Real Devices Only Banner */}
        {showRealOnly && (
          <div style={{
            position: "absolute",
            top: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            backgroundColor: "#f0fdf4",
            border: "1.5px solid #22c55e",
            borderRadius: "9999px",
            padding: "4px 14px",
            fontSize: "12px",
            fontWeight: "700",
            color: "#15803d",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(34,197,94,0.15)",
            pointerEvents: "none",
          }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#22c55e", display: "inline-block" }} />
            Showing real devices only ({visibleVehicles.length})
          </div>
        )}

        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.8)",
            }}
          >
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        )}

        {error && (
          <div style={{ position: "absolute", top: 16, left: 16, zIndex: 60, color: "#dc2626", background: "white", padding: 8, borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div
          className="realtime-map-card"
          style={{
            width: isMobile ? "100%" : "calc(100% - 60px)",
            height: isMobile ? "100%" : "calc(100% - 60px)",
            backgroundColor: "white",
            borderRadius: isMobile ? "0px" : "16px",
            boxShadow: isMobile ? "none" : "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
            overflow: "hidden",
            border: isMobile ? "none" : "1px solid #e2e8f0",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          {deviceType === "J42" && (
            <div style={{
              width: isMobile ? "100%" : "350px",
              minWidth: isMobile ? "100%" : "300px",
              height: isMobile ? "220px" : "100%",
              backgroundColor: "white",
              borderRight: isMobile ? "none" : "1px solid #e2e8f0",
              borderBottom: isMobile ? "1px solid #e2e8f0" : "none",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: "16px",
              boxSizing: "border-box"
            }}>
              <h2 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "12px", color: "#1e293b", marginTop: 0 }}>J42 Trackers</h2>
              <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: "12px", overflowX: isMobile ? "auto" : "visible" }}>
                {visibleVehicles.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => {
                      setSelectedVehicle(v);
                      if (mapRef.current && v.lat !== 0 && v.lng !== 0) {
                        mapRef.current.panTo({ lat: v.lat, lng: v.lng });
                        mapRef.current.setZoom(15);
                      }
                    }}
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      border: `1px solid ${selectedVehicle?.id === v.id ? "#3b82f6" : "#e2e8f0"}`,
                      backgroundColor: selectedVehicle?.id === v.id ? "#f0f9ff" : "white",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      minWidth: isMobile ? "220px" : "auto",
                      flexShrink: 0
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontWeight: "700", fontSize: "13px", color: "#1e293b" }}>{v.name}</span>
                      <span style={{
                        fontSize: "9px",
                        fontWeight: "700",
                        padding: "2px 6px",
                        borderRadius: "9999px",
                        backgroundColor: v.status?.toLowerCase() === "online" || v.status?.toLowerCase() === "moving" || v.status?.toLowerCase() === "stopped" ? "#dcfce7" : "#f1f5f9",
                        color: v.status?.toLowerCase() === "online" || v.status?.toLowerCase() === "moving" || v.status?.toLowerCase() === "stopped" ? "#15803d" : "#475569"
                      }}>
                        {v.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div>ID: <code style={{ backgroundColor: "#f1f5f9", padding: "1px 3px", borderRadius: "4px" }}>{v.id}</code></div>
                      <div>Battery: <strong style={{ color: "#0f172a" }}>{getBatteryDisplay(v.batteryVoltage, deviceType, v.externalVoltage)}</strong></div>
                      <div>Last Seen: {formatToLocalTime(v.lastSeen)}</div>
                      {deviceType === "J42" && v.gpsTime && formatToLocalTime(v.lastSeen) !== formatToLocalTime(v.gpsTime) && (
                        <div>GPS Time: {formatToLocalTime(v.gpsTime)}</div>
                      )}
                      {deviceType === "OBD" && v.lastEngineOn && (
                        <div>Last Engine On: {formatToLocalTime(v.lastEngineOn)}</div>
                      )}
                      {v.speed > 0 && <div>Speed: {Math.round(v.speed * 0.621371)} mph</div>}
                    </div>
                  </div>
                ))}
                {visibleVehicles.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8", width: "100%" }}>No active J42 trackers found.</div>
                )}
              </div>
            </div>
          )}

          <div style={{ position: "relative", flex: 1, height: "100%" }}>
            {/* Custom Responsive Controls Bar */}
            <div style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              zIndex: 10,
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: "10px",
              alignItems: isMobile ? "stretch" : "center",
              width: isMobile ? "calc(100% - 32px)" : "auto",
              pointerEvents: "none"
            }}>
              {/* Device Search Dropdown */}
              <div ref={dropdownRef} style={{ pointerEvents: "auto", position: "relative", width: isMobile ? "100%" : "260px" }}>
                <div
                  onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "1.5px solid #e2e8f0",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "white",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
                    gap: "10px",
                    minHeight: "38px"
                  }}
                >
                  <span style={{
                    color: selectedVehicle ? "#1e293b" : "#94a3b8",
                    fontSize: "13px",
                    fontWeight: "600",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: isMobile ? "none" : "180px"
                  }}>
                    {selectedVehicle ? selectedVehicle.name : `Select ${deviceType === "AI_DASHCAM" ? "Dashcam" : deviceType === "OBD" ? "OBD" : "Tracker"}...`}
                  </span>
                  <ChevronDown size={16} color="#64748b" style={{ flexShrink: 0 }} />
                </div>
                {isDeviceDropdownOpen && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "8px",
                    backgroundColor: "white",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
                    zIndex: 110,
                    maxHeight: "250px",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                  }}>
                    <div style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}>
                      <div style={{ position: "relative" }}>
                        <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                        <input
                          type="text"
                          placeholder={`Search ${deviceType === "AI_DASHCAM" ? "Dashcam" : deviceType === "OBD" ? "OBD" : "Tracker"}...`}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "8px 8px 8px 32px",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                            fontSize: "13px",
                            backgroundColor: "#f8fafc",
                            color: "black",
                            outline: "none",
                            boxSizing: "border-box"
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ overflowY: "auto", flex: 1 }}>
                      {filteredVehiclesForDropdown.length > 0 ? (
                        filteredVehiclesForDropdown.map(v => (
                          <div
                            key={v.id}
                            onClick={() => {
                              setSelectedVehicle(v);
                              setIsDeviceDropdownOpen(false);
                              setSearchTerm("");
                              if (mapRef.current && v.lat !== 0 && v.lng !== 0) {
                                mapRef.current.panTo({ lat: v.lat, lng: v.lng });
                                mapRef.current.setZoom(15);
                              }
                            }}
                            style={{
                              padding: "10px 14px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f1f5f9",
                              color: "#1e293b",
                              backgroundColor: selectedVehicle?.id === v.id ? "#f0f9ff" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              transition: "background-color 0.15s"
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = selectedVehicle?.id === v.id ? "#e0f2fe" : "#f8fafc"}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = selectedVehicle?.id === v.id ? "#f0f9ff" : "transparent"}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}>
                              <span style={{ fontWeight: "600", fontSize: "13px" }}>{v.name}</span>
                              <span style={{ fontSize: "11px", color: "#64748b" }}>ID: {v.id}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: markerColor(v.status)
                              }} />
                              <span style={{ fontSize: "11px", fontWeight: "500", color: "#64748b" }}>{v.status}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "12px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                          No devices found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Real Devices Only Toggle */}
              <button
                onClick={() => setShowRealOnly(prev => !prev)}
                title={showRealOnly ? "Showing real devices only — click to show all" : "Click to show real devices only"}
                style={{
                  pointerEvents: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "8px 14px",
                  height: "38px",
                  border: `1.5px solid ${showRealOnly ? "#22c55e" : "#e2e8f0"}`,
                  borderRadius: "10px",
                  backgroundColor: showRealOnly ? "#f0fdf4" : "white",
                  cursor: "pointer",
                  color: showRealOnly ? "#15803d" : "#64748b",
                  fontWeight: "600",
                  fontSize: "12px",
                  transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
                  boxShadow: showRealOnly ? "0 0 0 3px rgba(34,197,94,0.15)" : "0 4px 6px -1px rgb(0 0 0 / 0.05)",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <Shield size={14} style={{ flexShrink: 0 }} />
                {/* Toggle pill */}
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  width: "30px",
                  height: "16px",
                  borderRadius: "9999px",
                  backgroundColor: showRealOnly ? "#22c55e" : "#cbd5e1",
                  transition: "background-color 0.25s",
                  position: "relative",
                  flexShrink: 0,
                }}>
                  <span style={{
                    position: "absolute",
                    left: showRealOnly ? "15px" : "2px",
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)",
                  }} />
                </span>
                <span>Real Devices Only</span>
              </button>
            </div>

            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={defaultCenter}
              zoom={12}
              onLoad={(map) => (mapRef.current = map)}
              options={{
                disableDefaultUI: false,
                styles: [
                  {
                    featureType: "poi",
                    elementType: "labels",
                    stylers: [{ visibility: "off" }],
                  },
                ],
              }}
            >
              {visibleVehicles.filter(v => v.lat !== 0 || v.lng !== 0).map((vehicle) => (
                <Marker
                  key={vehicle.id}
                  position={{ lat: vehicle.lat, lng: vehicle.lng }}
                  onClick={() => setSelectedVehicle(vehicle)}
                  icon={window.google ? {
                    path: "M25,50 L50,5 L75,50 L50,40 Z",
                    fillColor: markerColor(vehicle.status),
                    fillOpacity: 1,
                    strokeColor: "white",
                    strokeWeight: 2,
                    scale: 0.5,
                    rotation: vehicle.heading || 0,
                    anchor: new window.google.maps.Point(50, 25),
                  } : null}
                />
              ))}

              {selectedVehicle && selectedVehicle.lat !== 0 && selectedVehicle.lng !== 0 && (
                <InfoWindow
                  position={{ lat: selectedVehicle.lat, lng: selectedVehicle.lng }}
                  onCloseClick={() => setSelectedVehicle(null)}
                >
                  <div style={{ padding: "8px", minWidth: "190px" }}>
                    <h3 style={{ fontWeight: "bold", marginBottom: "4px" }}>
                      {selectedVehicle.name}
                    </h3>
                    <div style={{ fontSize: "12px", color: "#555" }}>
                      <p>ID: {selectedVehicle.id}</p>
                      <p>Speed: {Math.round(selectedVehicle.speed * 0.621371)} mph</p>
                      <p>
                        Status:{" "}
                        <span style={{ color: markerColor(selectedVehicle.status), fontWeight: "bold" }}>
                          {selectedVehicle.status}
                        </span>
                      </p>
                      {selectedVehicle.batteryVoltage !== undefined && selectedVehicle.batteryVoltage !== null && (
                        <p>Battery: {getBatteryDisplay(selectedVehicle.batteryVoltage, deviceType, selectedVehicle.externalVoltage)}</p>
                      )}
                      <p>Last Seen: {formatToLocalTime(selectedVehicle.lastSeen)}</p>
                      {selectedVehicle.gpsTime && (deviceType !== "J42" || formatToLocalTime(selectedVehicle.lastSeen) !== formatToLocalTime(selectedVehicle.gpsTime)) && (
                        <p>GPS Time: {formatToLocalTime(selectedVehicle.gpsTime)}</p>
                      )}
                      {deviceType === "OBD" && selectedVehicle.lastEngineOn && (
                        <p>Last Engine On: {formatToLocalTime(selectedVehicle.lastEngineOn)}</p>
                      )}
                      <p style={{ marginTop: "6px", borderTop: "1px dashed #e2e8f0", paddingTop: "6px" }}>
                        <strong>Address:</strong>{" "}
                        {resolvedAddress ? (
                          resolvedAddress
                        ) : (
                          <button
                            onClick={handleShowAddress}
                            disabled={isGeocoding}
                            style={{
                              backgroundColor: "#3b82f6",
                              color: "white",
                              border: "none",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              cursor: "pointer",
                              marginLeft: "6px",
                              fontWeight: "600",
                            }}
                          >
                            {isGeocoding ? "Loading..." : "Show Address"}
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          </div>

          <Link
            to="/system-alerts"
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              backgroundColor: "#3b82f6",
              color: "white",
              padding: "12px 20px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              textDecoration: "none",
              fontWeight: "600",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              zIndex: 1000,
              transition: "transform 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <ShieldAlert size={20} />
              {unreadAlertsCount > 0 && (
                <span style={{
                  position: "absolute",
                  top: "-8px",
                  right: "-8px",
                  backgroundColor: "#ef4444",
                  color: "white",
                  borderRadius: "50%",
                  padding: "2px 6px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  minWidth: "16px",
                  textAlign: "center"
                }}>
                  {unreadAlertsCount}
                </span>
              )}
            </div>
            System Alerts
          </Link>
        </div>
      </div>
    </LoadScript>
  );
}
