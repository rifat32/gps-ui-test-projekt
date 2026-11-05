import { formatDeviceDateTime } from "../utils/deviceTime";
import {
  ArrowLeft,
  Camera,
  Grid2X2,
  Grid3X3,
  LayoutGrid,
  Maximize,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Server,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";
import DeviceCard from "../components/DeviceCard";
import DashcamAlert from "../components/DashcamAlert";
import VideoPlayer from "../components/VideoPlayer";
import MediaViewer from "../components/MediaViewer";
import deviceApi from "../services/deviceApi";

const WS_URL = import.meta.env.VITE_DASHCAM_WS_URL || import.meta.env.VITE_WS_URL;

// Mock Data
const MOCK_ALERTS = [
  {
    id: 1,
    type: "DSM",
    message: "Driver Drowsiness Detected",
    time: "20:45:12",
    deviceId: "Truck-01",
  },
  {
    id: 2,
    type: "ADAS",
    message: "Lane Departure Warning",
    time: "20:43:05",
    deviceId: "Truck-04",
  },
  {
    id: 3,
    type: "BSD",
    message: "Blind Spot Obstacle",
    time: "20:40:55",
    deviceId: "Van-02",
  },
];

// Mock Recordings Data
const MOCK_RECORDINGS = [
  {
    id: 101,
    thumbnail:
      "https://images.unsplash.com/photo-1566008885218-90abf9200ddb?w=800&q=80",
    duration: "05:23",
    time: "10:45 AM",
    location: "Downtown Ave",
    deviceId: "Truck-01",
  },
  {
    id: 102,
    thumbnail:
      "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&q=80",
    duration: "12:15",
    time: "09:30 AM",
    location: "Highway 55",
    deviceId: "Van-02",
  },
  {
    id: 103,
    thumbnail:
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&q=80",
    duration: "08:42",
    time: "08:15 AM",
    location: "Industrial Park",
    deviceId: "Truck-04",
  },
];

export default function Dashcam({ theme, toggleTheme }) {
  const [gridSize, setGridSize] = useState(1); // Default to one large camera
  const [alerts, setAlerts] = useState([]);
  const [devices, setDevices] = useState({ active: [], historical: [] });
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("live");
  const [activeChannel, setActiveChannel] = useState(1);
  const [selectedMedia, setSelectedMedia] = useState(null); // For viewing image/video
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);

  // Live stream state: { [deviceId]: { url, webrtcUrl, channel, status: 'idle'|'loading'|'live'|'error', error } }
  const [liveStreams, setLiveStreams] = useState({});
  const activeStreamsRef = useRef({});
  const lastRequestTimesRef = useRef({}); // { [key]: timestamp }
  const socketRef = useRef(null);

  const isDeviceOnline = (device) => String(device?.status || "").toLowerCase() === "online";

  // Fetch initial AI events
  const fetchInitialAlerts = async () => {
    try {
      const data = await deviceApi.getAiEvents({ limit: 20 });
      const formatted = (data.events || []).map((event) => {
        const timeStr = formatDeviceDateTime(event.event_time);
        return {
          id: event.id,
          type: event.category,
          message: event.friendly_name || event.event_code,
          friendly_name: event.friendly_name,
          description: event.description,
          time: timeStr,
          deviceId: event.device_id,
          file_path: event.file_path,
          video_path: event.video_path,
          file_path_back: event.file_path_back,
          video_path_back: event.video_path_back,
          image_url: event.image_url,
          video_url: event.video_url,
          image_url_back: event.image_url_back,
          video_url_back: event.video_url_back,
          media_files: event.media_files,
        };
      });
      setAlerts(formatted);
    } catch (err) {
      console.error("Failed to fetch AI events:", err);
    }
  };

  // Fetch devices
  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const data = await deviceApi.getDevicesV2({ device_type: 'AI_DASHCAM' });
      const activeDevices = data.data.filter((d) => d.status?.toLowerCase() === "online");
      const historicalDevices = data.data.filter((d) => d.status?.toLowerCase() === "offline");
      setDevices({ active: activeDevices, historical: historicalDevices });
      if (!selectedDevice && activeDevices.length > 0) {
        setSelectedDevice(activeDevices[0]);
      }
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  // Initialize Socket.io and fetch data
  useEffect(() => {
    fetchInitialAlerts();
    fetchDevices();

    const socket = import.meta.env.VITE_SERVER_TYPE === "new"
      ? io(WS_URL, {
          path: "/socket.io",
          transports: ["polling"],
        })
      : io(WS_URL);
    socketRef.current = socket;

    socketRef.current.on("ai_event", (event) => {
      console.log("Real-time AI event:", event);
      setAlerts((prev) => {
        const newAlert = {
          id: Date.now(),
          type: event.category,
          message: event.friendly_name || event.code || event.event_code,
          friendly_name: event.friendly_name,
          description: event.description,
          time: formatDeviceDateTime(event.event_time || event.gps_time || event.timestamp),
          deviceId: event.deviceId || event.device_id,
          serial_no: event.hex_id || event.alarm_serial, // STORE THIS FOR MATCHING
          file_path: event.file_path,
          video_path: event.video_path,
          file_path_back: event.file_path_back,
          video_path_back: event.video_path_back,
          image_url: event.image_url,
          video_url: event.video_url,
          image_url_back: event.image_url_back,
          video_url_back: event.video_url_back,
          media_files: event.media_files,
        };
        // Avoid adding if same alert arrived via polling/refresh?
        // For simplicity, just unshift
        return [newAlert, ...prev].slice(0, 20);
      });
    });

    socketRef.current.on("ai_file_complete", (data) => {
      console.log("Media upload complete:", data);
      setAlerts((prev) =>
        prev.map((alert) => {
          // Match by serial_no (hex ID) and device_id
          if (
            alert.deviceId === data.device_id &&
            (String(alert.id).includes(data.serial_no) ||
              alert.id === data.serial_no ||
              alert.serial_no === data.serial_no)
          ) {
            return {
              ...alert,
              file_path: data.file_path || alert.file_path,
              video_path: data.video_path || alert.video_path,
              file_path_back: data.file_path_back || alert.file_path_back,
              video_path_back: data.video_path_back || alert.video_path_back,
              image_url: data.image_url || alert.image_url,
              video_url: data.video_url || alert.video_url,
              image_url_back: data.image_url_back || alert.image_url_back,
              video_url_back: data.video_url_back || alert.video_url_back,
            };
          }
          if (
            alert.deviceId === data.device_id &&
            alert.serial_no === data.serial_no
          ) {
            return {
              ...alert,
              file_path: data.file_path || alert.file_path,
              video_path: data.video_path || alert.video_path,
              file_path_back: data.file_path_back || alert.file_path_back,
              video_path_back: data.video_path_back || alert.video_path_back,
              image_url: data.image_url || alert.image_url,
              video_url: data.video_url || alert.video_url,
              image_url_back: data.image_url_back || alert.image_url_back,
              video_url_back: data.video_url_back || alert.video_url_back,
            };
          }
          return alert;
        }),
      );
    });

      // Re-register active streams on reconnect
      socketRef.current.on("connect", () => {
        console.log("🔌 [Socket.io] Connected/Reconnected. Syncing viewer state...");
        Object.entries(activeStreamsRef.current).forEach(([key, status]) => {
            if (status === "loading" || status === "live") {
                const [deviceId, chPart] = key.split("_ch");
                const channel = parseInt(chPart) || 1;
                socketRef.current.emit("register_viewer", { deviceId, channel });
                console.log(`📡 [Socket.io] Re-registered viewer for ${key}`);
            }
        });
      });

      // Log incoming stream_ready events
      socketRef.current.onAny((event, ...args) => {
        if (event.startsWith('stream_ready_')) {
          const { deviceId, channel, webrtcUrl, hlsUrl } = args[0];
          const key = `${deviceId}_ch${channel}`;

          setLiveStreams((prev) => {
            const existing = prev[key];
            // Harden: Only update if not already live OR if URL changed
            if (existing && existing.status === "live" && existing.webrtcUrl === webrtcUrl) {
                return prev;
            }
            
            console.log(`📡 [Socket.io] Stream ready for ${key}:`, webrtcUrl);
            return {
              ...prev,
              [key]: { 
                url: hlsUrl || (existing ? existing.url : "null"), 
                webrtcUrl, 
                channel, 
                status: "live", 
                error: null 
              },
            };
          });
          activeStreamsRef.current[key] = "live";
        }
      });

      return () => {
        if (socketRef.current) socketRef.current.disconnect();
      };
    }, []);

  // Start live stream for a device
  const startLiveStream = async (device, channel, force = false) => {
    const key = `${device.id}_ch${channel}`;
    const now = Date.now();
    const lastRequest = lastRequestTimesRef.current[key] || 0;
    
    // Debounce: ignore multiple requests for the same stream within 2 seconds
    if (!force && now - lastRequest < 2000) {
        console.log(`⏳ [START_LIVE] Debounced request for ${key}`);
        return;
    }
    lastRequestTimesRef.current[key] = now;

    console.log({ key, force });
    
    // Allow retrying if 'loading' (stuck) or 'error'. 
    // Only skip if already 'live' (and not forcing).
    if (!force && activeStreamsRef.current[key] === "live") return;

    if (!isDeviceOnline(device)) {
      const message = `Device ${device.id} is ${device.status || "OFFLINE"}; live command was not sent`;
      console.warn(`⚠️ [START_LIVE] ${message}`);
      setLiveStreams((prev) => ({
        ...prev,
        [key]: {
          url: null,
          webrtcUrl: null,
          channel,
          status: "error",
          error: message,
        },
      }));
      activeStreamsRef.current[key] = "error";
      return;
    }

    // Clear all other channels for this device since the simulator/device 
    // usually only supports one active stream at a time or we want a fresh start.
    Object.keys(activeStreamsRef.current).forEach(k => {
        if (k.startsWith(`${device.id}_ch`)) {
            delete activeStreamsRef.current[k];
        }
    });

    setLiveStreams((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
            if (k.startsWith(`${device.id}_ch`)) {
                delete next[k];
            }
        });
        next[key] = { url: null, webrtcUrl: null, channel, status: "loading", error: null };
        return next;
    });

    try {
      activeStreamsRef.current[key] = "loading";
      
      // ⏳ WAIT FOR SOCKET: Wait up to 3s for the socket to connect if it hasn't yet
      let socket = socketRef.current;
      if (socket && !socket.connected) {
          console.log(`⏳ [START_LIVE] Socket connecting for ${key}...`);
          await new Promise((resolve) => {
              const timeout = setTimeout(resolve, 3000);
              socket.once("connect", () => {
                  clearTimeout(timeout);
                  resolve();
              });
          });
      }

      if (!socket || !socket.connected) {
          console.warn(`⚠️ [START_LIVE] Proceeding without stable socket for ${key}. Registration might fail.`);
      }
      
      const socketId = socket?.id;
      const response = await deviceApi.startLive(device.id, channel, socketId);
      const hlsUrl = response.streamUrl;
      
      console.log(`📡 [START_LIVE] API Response (socketId: ${socketId}):`, response);

      setLiveStreams((prev) => (prev[key]?.status === "loading" ? {
          ...prev,
          [key]: { ...prev[key], url: hlsUrl, status: "loading" }
      } : prev));

    } catch (err) {
      console.error(`Failed to start live stream for ${device.id}:`, err);
      activeStreamsRef.current[key] = "error";
      setLiveStreams((prev) => ({
        ...prev,
        [key]: {
          url: null,
          webrtcUrl: null,
          channel,
          status: "error",
          error: err.message || "Failed to start stream",
        },
      }));
    }
  };

  // When selected device or active channel changes, start its live stream
  useEffect(() => {
    if (selectedDevice) {
      startLiveStream(selectedDevice, activeChannel);
    }
  }, [selectedDevice, activeChannel]);

  const handleDeviceSelect = (device) => {
    setSelectedDevice(device);

    // Do not rely only on the React effect. If the user clicks the already
    // selected device, selectedDevice does not change, so the effect will not
    // run and no API call will be made. Force a live-start attempt from the
    // click handler itself.
    startLiveStream(device, activeChannel, true);
  };

  const getStreamForCell = (cellIndex) => {
    // Cell 0 always shows the selected device's current channel
    if (cellIndex === 0 && selectedDevice) {
      const key = `${selectedDevice.id}_ch${activeChannel}`;
      return liveStreams[key] || null;
    }
    // Other cells show other online devices
    const onlineDevices = devices.active.filter(
      (d) => d.id !== selectedDevice?.id,
    );
    const device = onlineDevices[cellIndex - 1];
    if (!device) return null;
    const key = `${device.id}_ch${activeChannel}`;
    return liveStreams[key] || null;
  };

  const getDeviceForCell = (cellIndex) => {
    if (cellIndex === 0) return selectedDevice;
    const onlineDevices = devices.active.filter(
      (d) => d.id !== selectedDevice?.id,
    );
    return onlineDevices[cellIndex - 1] || null;
  };

  const renderVideoGrid = () => {
    const cells = Array.from({ length: gridSize });
    const gridCols = Math.sqrt(gridSize);

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gap: "0px",
          height: "100%",
          padding: "0px",
          background: "var(--bg-color)",
        }}
      >
        {cells.map((_, i) => {
          const stream = getStreamForCell(i);
          const device = getDeviceForCell(i);
          return (
            <VideoPlayer
              key={i}
              i={i}
              device={device}
              selectedDevice={selectedDevice}
              setSelectedDevice={setSelectedDevice}
              devices={devices}
              streamState={stream}
              onRetry={() => device && startLiveStream(device, activeChannel, true)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="dashcam-page"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-color)",
        color: "var(--text-primary)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header Bar */}
      <header
        style={{
          height: "64px",
          background: "var(--sidebar-bg)",
          borderBottom: "1px solid var(--surface-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Link
            to="/"
            style={{
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "white")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#94a3b8")}
          >
            <ArrowLeft size={20} />
          </Link>
          <div
            style={{ width: "1px", height: "24px", background: "#1e293b" }}
          ></div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
              }}
            >
              <Camera size={20} color="white" />
            </div>
            <div>
              <h1
                style={{
                  fontSize: "16px",
                  fontWeight: "800",
                  margin: 0,
                  letterSpacing: "0.5px",
                }}
              >
                AI_DASHCAM AI
              </h1>
              <div
                style={{
                  fontSize: "10px",
                  color: "#3b82f6",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                }}
              >
                Live Operations Center
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <button
            onClick={toggleTheme}
            style={{
              background: "var(--btn-secondary-bg)",
              border: "1px solid var(--surface-border)",
              color: "var(--text-primary)",
              padding: "8px",
              borderRadius: "10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {/* Grid selection removed to satisfy 'remove other boxes' request */}

          <div
            style={{
              display: "flex",
              background: "#1e293b",
              borderRadius: "10px",
              padding: "4px",
            }}
          >
            <button
              onClick={() => setActiveChannel(1)}
              style={{
                background: activeChannel === 1 ? "#3b82f6" : "transparent",
                border: "none",
                color: activeChannel === 1 ? "white" : "#64748b",
                padding: "6px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                fontSize: "12px",
                fontWeight: "700",
              }}
            >
              CH 1
            </button>
            <button
              onClick={() => setActiveChannel(2)}
              style={{
                background: activeChannel === 2 ? "#3b82f6" : "transparent",
                border: "none",
                color: activeChannel === 2 ? "white" : "#64748b",
                padding: "6px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
                fontSize: "12px",
                fontWeight: "700",
              }}
            >
              CH 2
            </button>
          </div>

          <button
            style={{
              background: "#3b82f6",
              border: "none",
              color: "white",
              padding: "10px 18px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
            }}
          >
            <Maximize size={16} /> Fullscreen
          </button>
          <Link
            to="/video-settings"
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "white",
              padding: "10px 18px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            <Settings size={16} /> Video Settings
          </Link>
          <Link
            to="/saved-videos"
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "white",
              padding: "10px 18px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            <Server size={16} /> Saved Videos
          </Link>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar Trigger */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            position: "absolute",
            left: isSidebarOpen ? "280px" : "0",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 100,
            background: "#1e293b",
            border: "1px solid #334155",
            borderLeft: "none",
            borderRadius: "0 8px 8px 0",
            padding: "12px 4px",
            cursor: "pointer",
            color: "#94a3b8",
            transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {isSidebarOpen ? (
            <PanelLeftClose size={16} />
          ) : (
            <PanelLeftOpen size={16} />
          )}
        </button>

        {/* Sidebar - Device List */}
        <aside
          style={{
            width: isSidebarOpen ? "280px" : "0",
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--surface-border)",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "20px", borderBottom: "1px solid #1e293b" }}>
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#475569",
                }}
              />
              <input
                placeholder="Search devices..."
                style={{
                  width: "100%",
                  background: "var(--input-bg)",
                  border: "1px solid var(--surface-border)",
                  borderRadius: "10px",
                  padding: "10px 10px 10px 38px",
                  color: "white",
                  boxSizing: "border-box",
                  fontSize: "14px",
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
            <div
              style={{
                padding: "10px 12px",
                fontSize: "11px",
                color: "#475569",
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Fleet Devices
            </div>
            {isLoadingDevices ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    marginBottom: "12px",
                    background: "var(--input-bg)",
                    border: "1px solid var(--surface-border)",
                    position: "relative",
                    overflow: "hidden",
                    opacity: 0.6,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent)",
                      animation: "shimmer 1.8s infinite",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "rgba(100, 116, 139, 0.2)",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          width: "65%",
                          height: "12px",
                          borderRadius: "4px",
                          background: "rgba(100, 116, 139, 0.25)",
                          marginBottom: "8px",
                        }}
                      />
                      <div
                        style={{
                          width: "35%",
                          height: "8px",
                          borderRadius: "3px",
                          background: "rgba(100, 116, 139, 0.15)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : [...devices.active, ...devices.historical].length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--text-secondary)",
                  fontSize: "14px",
                }}
              >
                No dashcam devices found
              </div>
            ) : (
              [...devices.active, ...devices.historical].map((dev) => (
                <DeviceCard
                  key={dev.id}
                  dev={dev}
                  selectedDevice={selectedDevice}
                  setSelectedDevice={handleDeviceSelect}
                  streamStatus={liveStreams[`${dev.id}_ch${activeChannel}`]?.status || "idle"}
                />
              ))
            )}
          </div>
        </aside>

        {/* Main Content - Grid */}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#ffffffff",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flex: 1,
              overflow: "hidden",
            }}
          >
            {renderVideoGrid()}
          </div>
        </main>

        {/* Right Panel - Alerts & Recordings */}
        {/* <aside
          style={{
            width: "340px",
            background: "var(--sidebar-bg)",
            borderLeft: "1px solid var(--surface-border)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              gap: "8px",
            }}
          >
            <button
              onClick={() => setActiveTab("alerts")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                background:
                  activeTab === "alerts" ? "#3b82f6" : "rgba(30, 41, 59, 0.5)",
                color: activeTab === "alerts" ? "white" : "#94a3b8",
                border: "none",
                transition: "all 0.2s",
              }}
            >
              Live Alerts
            </button>
            <button
              onClick={() => setActiveTab("recordings")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                background:
                  activeTab === "recordings"
                    ? "#3b82f6"
                    : "rgba(30, 41, 59, 0.5)",
                color: activeTab === "recordings" ? "white" : "#94a3b8",
                border: "none",
                transition: "all 0.2s",
              }}
            >
              Recorded
            </button>
          </div>

          <div
            style={{ flex: 1, overflowY: "auto", padding: "16px" }}
            className="custom-scrollbar"
          >
            {activeTab === "alerts" ? (
              alerts.length > 0 ? (
                alerts.map((alert) => (
                  <AI DashcamAlert key={alert.id} alert={alert} onOpenMedia={setSelectedMedia} />
                ))
              ) : (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#475569" }}>
                  Waiting for alerts...
                </div>
              )
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {MOCK_RECORDINGS.map((rec) => (
                  <div
                    key={rec.id}
                    className="recording-card"
                    style={{
                      background: "var(--surface-color)",
                      borderRadius: "12px",
                      overflow: "hidden",
                      border: "1px solid var(--surface-border)",
                      cursor: "pointer",
                      transition: "transform 0.2s",
                    }}
                  >
                    <div style={{ position: "relative", height: "120px" }}>
                      <img
                        src={rec.thumbnail}
                        alt="Thumbnail"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          bottom: "8px",
                          right: "8px",
                          background: "rgba(0,0,0,0.7)",
                          color: "white",
                          fontSize: "10px",
                          fontWeight: "700",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {rec.duration}
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%)",
                          background: "rgba(59, 130, 246, 0.8)",
                          borderRadius: "50%",
                          width: "32px",
                          height: "32px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        }}
                      >
                        <div
                          style={{
                            width: 0,
                            height: 0,
                            borderTop: "5px solid transparent",
                            borderBottom: "5px solid transparent",
                            borderLeft: "8px solid white",
                            marginLeft: "3px",
                          }}
                        ></div>
                      </div>
                    </div>
                    <div style={{ padding: "12px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: "700",
                            color: "#f8fafc",
                          }}
                        >
                          {rec.location}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                          }}
                        >
                          {rec.time}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#64748b",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            background: "#3b82f610",
                            borderRadius: "3px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Camera size={10} color="#3b82f6" />
                        </div>
                        {rec.deviceId}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "20px",
              background: "#0f172a",
              borderTop: "1px solid #1e293b",
            }}
          >
            <button
              style={{
                width: "100%",
                background: "var(--btn-secondary-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--surface-border)",
                padding: "12px",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "700",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "#334155")
              }
              onMouseOut={(e) => (e.currentTarget.style.background = "#1e293b")}
            >
              View Activity Log
            </button>
          </div>
        </aside> */}
      </div>

      {/* Media Viewer Modal */}
      {selectedMedia && (
        <MediaViewer
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
        />
      )}

      {/* GLOBAL STYLES */}
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(1.1); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #1e293b;
            border-radius: 10px;
          }
          .video-cell:hover {
            transform: translateY(-2px);
            border-color: #3b82f6 !important;
            box-shadow: 0 12px 30px rgba(0,0,0,0.4) !important;
          }
          .video-cell:hover svg {
            transform: scale(1.1);
          }
          .alert-card:hover {
            background: #1e293b !important;
            transform: translateX(4px);
            border-color: #3b82f633 !important;
          }
        `}
      </style>
    </div>
  );
}
