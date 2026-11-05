import { Image, PlaySquare, Copy, Check, ExternalLink, Video, Loader2, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import deviceApi from "../services/deviceApi";

const BASE_URL =
  import.meta.env.VITE_DASHCAM_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "";

const ALERT_CATEGORY_TABS = [
  { id: "", label: "All Alerts" },
  { id: "ADAS", label: "ADAS" },
  { id: "DSM", label: "DSM" },
  { id: "BEHAVIOR", label: "G-Sensor (G-Shock)" },
  { id: "HARDWARE", label: "Hardware / Video" },
  { id: "IO", label: "IO / Physical" },
  { id: "SPEED_GPS", label: "Speed / GPS" },
  { id: "GEOFENCE", label: "Geofence / Route" },
  { id: "VIDEO", label: "Video" },
];

const CATEGORY_STYLES = {
  ADAS: { bg: "#ef444415", color: "#ef4444", border: "#ef444433" },
  DSM: { bg: "#f59e0b15", color: "#f59e0b", border: "#f59e0b33" },
  BEHAVIOR: { bg: "#a855f715", color: "#a855f7", border: "#a855f733" },
  HARDWARE: { bg: "#0ea5e915", color: "#0ea5e9", border: "#0ea5e933" },
  IO: { bg: "#22c55e15", color: "#22c55e", border: "#22c55e33" },
  SPEED_GPS: { bg: "#eab30815", color: "#eab308", border: "#eab30833" },
  GEOFENCE: { bg: "#14b8a615", color: "#14b8a6", border: "#14b8a633" },
  VIDEO: { bg: "#6366f115", color: "#6366f1", border: "#6366f133" },
};

const getCategoryStyle = (type) =>
  CATEGORY_STYLES[type] || CATEGORY_STYLES.ADAS;

export default function NotificationTable({
  alerts,
  onOpenMedia,
  pagination,
  onPageChange,
  devices = [],
  filterDeviceId = "",
  onDeviceChange,
  activeCategory = "",
  onCategoryChange,
  startDate = "",
  endDate = "",
  onDateChange,
  isLoading = false,
}) {
  const [copiedType, setCopiedType] = useState(null); // { id: 123, type: 'image' | 'video' }
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [requestVideoState, setRequestVideoState] = useState({}); // { [serial_no]: 'loading' | 'requested' | 'error' }
  const [deleteVideoState, setDeleteVideoState] = useState({}); // { [rowKey]: 'deleting' | 'deleted' | 'error' }

  const handleManualRequestVideo = async (alertItem) => {
    const deviceId = alertItem.device_id || alertItem.deviceId;
    if (!deviceId) {
      console.warn("Missing deviceId for manual video request:", alertItem);
      return;
    }

    const rowKey = alertItem.id ? String(alertItem.id) : (alertItem.serial_no ? String(alertItem.serial_no) : String(alertItem.time || Date.now()));
    let rawSerial = alertItem.serial_no || alertItem.serialNo || alertItem.alarm_serial || alertItem.alarmSerial || alertItem.hex_id || alertItem.dedupe_key || alertItem.id || Date.now();
    let serialHex = String(rawSerial).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    if (serialHex.length < 32) {
      serialHex = serialHex.padStart(32, "0");
    } else if (serialHex.length > 32) {
      serialHex = serialHex.substring(0, 32);
    }

    setRequestVideoState((prev) => ({ ...prev, [rowKey]: "loading" }));
    try {
      const res = await deviceApi.requestAiEventVideo(deviceId, serialHex);
      if (res && res.success) {
        setRequestVideoState((prev) => ({ ...prev, [rowKey]: "requested" }));
        // Auto reset back to default button after 10 seconds
        setTimeout(() => {
          setRequestVideoState((prev) => {
            const next = { ...prev };
            delete next[rowKey];
            return next;
          });
        }, 10000);
      } else {
        console.error("Failed to request video clip:", res?.error);
        setRequestVideoState((prev) => ({ ...prev, [rowKey]: "error" }));
      }
    } catch (err) {
      console.error("Error requesting video clip:", err);
      setRequestVideoState((prev) => ({ ...prev, [rowKey]: "error" }));
    }
  };

  const handleDeleteVideo = async (alertItem) => {
    const rowKey = alertItem.id ? String(alertItem.id) : (alertItem.dedupe_key ? String(alertItem.dedupe_key) : (alertItem.serial_no ? String(alertItem.serial_no) : String(alertItem.time || Date.now())));
    const deviceId = alertItem.device_id || alertItem.deviceId;
    const serialNo = alertItem.serial_no || alertItem.serialNo || alertItem.alarm_serial || alertItem.alarmSerial || alertItem.hex_id;

    setDeleteVideoState((prev) => ({ ...prev, [rowKey]: "deleting" }));
    try {
      const res = await deviceApi.deleteAiEventVideo(alertItem.id || alertItem.dedupe_key, deviceId, serialNo);
      if (res && res.success) {
        setDeleteVideoState((prev) => ({ ...prev, [rowKey]: "deleted" }));
        alertItem.video_path = null;
        alertItem.video_path_back = null;
        alertItem.video_url = null;
        alertItem.video_url_back = null;
        if (Array.isArray(alertItem.media_files)) {
          alertItem.media_files = alertItem.media_files.filter(
            (m) => m.media_type !== "video" && !["video_path", "video_path_back"].includes(m.column)
          );
        }
      } else {
        console.error("Failed to delete video:", res?.error);
        setDeleteVideoState((prev) => ({ ...prev, [rowKey]: "error" }));
      }
    } catch (err) {
      console.error("Error deleting video:", err);
      setDeleteVideoState((prev) => ({ ...prev, [rowKey]: "error" }));
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getProperUrl = (path) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;

    // If the path is absolute (contains /home/), extract the relative part
    if (path.includes("downloads/")) {
      const relativePart = path.substring(path.indexOf("downloads/"));
      const dashcamBase = BASE_URL;
      return `${dashcamBase}/${relativePart}`;
    }

    return path.startsWith("/") ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
  };

  const handleCopy = (path, id, type) => {
    // const fullPath = getProperUrl(path);
    const fullPath = path;
    if (!fullPath) return;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(fullPath)
        .then(() => {
          setCopiedType({ id, type });
          setTimeout(() => setCopiedType(null), 2000);
        })
        .catch((err) => console.error("Clipboard copy failed:", err));
    } else {
      // Fallback for non-HTTPS HTTP environments (e.g. http://54.37.225.65)
      try {
        const textArea = document.createElement("textarea");
        textArea.value = fullPath;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
        setCopiedType({ id, type });
        setTimeout(() => setCopiedType(null), 2000);
      } catch (err) {
        console.error("Fallback copy failed:", err);
      }
    }
  };

  const isCopied = (id, type) =>
    copiedType?.id === id && copiedType?.type === type;

  return (
    <div
      className="notification-table-container custom-scrollbar"
      style={{
        background: "var(--sidebar-bg)",
        border: "1px solid var(--surface-border)",
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        marginBottom: "0px",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          background: "var(--header-bg)",
          borderBottom: "1px solid var(--surface-border)",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          alignItems: isMobile ? "stretch" : "center",
          gap: isMobile ? "12px" : "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            gap: isMobile ? "12px" : "20px",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: "700",
                color: "var(--header-text)",
                whiteSpace: "nowrap",
              }}
            >
              AI Notifications
            </h3>
            {isMobile && (
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--header-text)",
                  opacity: 0.8,
                  fontWeight: "600",
                }}
              >
                Total: {pagination?.total || alerts.length}
              </span>
            )}
          </div>

          <select
            value={filterDeviceId}
            onChange={(e) => onDeviceChange && onDeviceChange(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              background: "var(--card-bg)",
              border: "1px solid var(--surface-border)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontWeight: "600",
              outline: "none",
              cursor: "pointer",
              width: isMobile ? "100%" : "auto",
              minWidth: isMobile ? "none" : "180px",
              maxWidth: isMobile ? "none" : "250px",
            }}
          >
            <option value="">-- All AI Dashcams --</option>
            {devices.map((dev) => {
              const isOnline =
                String(dev.status).toUpperCase() === "ONLINE" ||
                String(dev.liveStatus).toUpperCase() === "ONLINE";
              return (
                <option
                  key={dev.device_id || dev.id}
                  value={dev.device_id || dev.id}
                >
                  {dev.device_id || dev.id}{" "}
                  {isOnline ? "(Online)" : "(Offline)"}
                </option>
              );
            })}
          </select>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <input
              type="date"
              value={startDate}
              onChange={(e) => onDateChange && onDateChange(e.target.value, endDate)}
              style={{
                padding: "7px 10px",
                borderRadius: "8px",
                background: "var(--card-bg)",
                border: "1px solid var(--surface-border)",
                color: "var(--text-primary)",
                fontSize: "12px",
                fontWeight: "600",
                outline: "none",
              }}
              title="Start Date"
            />
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onDateChange && onDateChange(startDate, e.target.value)}
              style={{
                padding: "7px 10px",
                borderRadius: "8px",
                background: "var(--card-bg)",
                border: "1px solid var(--surface-border)",
                color: "var(--text-primary)",
                fontSize: "12px",
                fontWeight: "600",
                outline: "none",
              }}
              title="End Date"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => onDateChange && onDateChange("", "")}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#ef4444",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Clear Date
              </button>
            )}
          </div>

          {/* Category Tabs / Dropdown for Mobile */}
          {isMobile ? (
            <select
              value={activeCategory}
              onChange={(e) =>
                onCategoryChange && onCategoryChange(e.target.value)
              }
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                background: "var(--card-bg)",
                border: "1px solid var(--surface-border)",
                color: "var(--text-primary)",
                fontSize: "13px",
                fontWeight: "600",
                outline: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
              {ALERT_CATEGORY_TABS.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label === "All Alerts"
                    ? "All Alert Categories"
                    : tab.label}
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                display: "flex",
                gap: "2px",
                marginLeft: "24px",
                background: "rgba(15, 23, 42, 0.45)", // Semi-transparent dark slate
                padding: "3px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                flexWrap: "wrap",
                maxWidth: "720px",
              }}
            >
              {ALERT_CATEGORY_TABS.map((tab) => {
                const active = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onCategoryChange && onCategoryChange(tab.id)}
                    style={{
                      padding: "6px 16px",
                      borderRadius: "7px",
                      background: active ? "#ffffff" : "transparent",
                      color: active ? "#1e293b" : "rgba(255, 255, 255, 0.8)",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: active ? "800" : "600",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: active
                        ? "0 4px 12px rgba(0, 0, 0, 0.2)"
                        : "none",
                    }}
                    onMouseOver={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = "#ffffff";
                        e.currentTarget.style.background =
                          "rgba(255, 255, 255, 0.08)";
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!active) {
                        e.currentTarget.style.color =
                          "rgba(255, 255, 255, 0.8)";
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(15, 23, 42, 0.25)",
              padding: "4px 10px",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)",
              justifyContent: "space-between",
              width: isMobile ? "100%" : "auto",
              marginTop: isMobile ? "4px" : "0px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                fontWeight: "700",
              }}
            >
              Page {pagination.page}/{pagination.totalPages}
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={!pagination.hasPrev}
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: pagination.hasPrev
                    ? "#3b82f6"
                    : "var(--btn-disabled-bg)",
                  color: pagination.hasPrev
                    ? "#ffffff"
                    : "var(--text-disabled)",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: "bold",
                  cursor: pagination.hasPrev ? "pointer" : "not-allowed",
                }}
              >
                Prev
              </button>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={!pagination.hasNext}
                style={{
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: pagination.hasNext
                    ? "#3b82f6"
                    : "var(--btn-disabled-bg)",
                  color: pagination.hasNext
                    ? "#ffffff"
                    : "var(--text-disabled)",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: "bold",
                  cursor: pagination.hasNext ? "pointer" : "not-allowed",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {!isMobile && !pagination && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--header-text)",
              opacity: 0.8,
              fontWeight: "600",
            }}
          >
            Total: {pagination?.total || alerts.length}
          </span>
        )}
      </div>

      <div
        style={{ flex: 1, overflow: "auto", position: "relative" }}
        className="custom-scrollbar"
      >
        {isLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              backdropFilter: "blur(2px)",
            }}
          >
            <div
              className="media-viewer-spinner"
              style={{ width: "32px", height: "32px" }}
            ></div>
          </div>
        )}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            textAlign: "left",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "#0f172a",
              zIndex: 10,
            }}
          >
            <tr>
              <th style={thStyle}>Device</th>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>Alert Type</th>
              <th style={thStyle}>Intelligence Event</th>
              <th style={thStyle}>Setting Video</th>
              <th style={thStyle}>Speed</th>
              <th style={thStyle}>Media View</th>
              <th style={thStyle}>Copy Links</th>
              <th style={thStyle}>Delete Video</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length > 0 ? (
              alerts.map((alert) => {
                 const mediaList = (() => {
                  if (!alert.media_files) return [];
                  let parsed = alert.media_files;
                  if (typeof parsed === "string") {
                    try {
                      parsed = JSON.parse(parsed);
                    } catch (e) {
                      return [];
                    }
                  }
                  if (!Array.isArray(parsed)) return [];
                  return parsed.map((item) => {
                    let s3Url = item.url;
                    if (!s3Url) {
                      if (item.column === "file_path") s3Url = alert.image_url;
                      else if (item.column === "video_path") s3Url = alert.video_url;
                      else if (item.column === "file_path_back") s3Url = alert.image_url_back;
                      else if (item.column === "video_path_back") s3Url = alert.video_url_back;
                    }

                    const colStr = item.column || "";
                    const pathStr = item.path || "";
                    const fileStr = (item.file_name || pathStr.split("/").pop() || "").toLowerCase();
                    const isBack =
                      colStr.includes("back") ||
                      fileStr.includes("ch2") ||
                      fileStr.includes("cabin") ||
                      fileStr.startsWith("03_") ||
                      fileStr.includes("_04_") ||
                      fileStr.includes("_04.") ||
                      item.channel === 2 ||
                      item.channel === "2";
                    const isVid =
                      colStr.includes("video") ||
                      fileStr.startsWith("02_") ||
                      fileStr.endsWith(".mp4") ||
                      fileStr.endsWith(".avi") ||
                      item.media_type === "video";

                    return {
                      ...item,
                      url: s3Url,
                      channel: isBack ? 2 : (item.channel ? Number(item.channel) : 1),
                      media_type: isVid ? "video" : (item.media_type || "image"),
                    };
                  });
                })();

                const normalizedMediaList = [...mediaList];
                const addIfMissing = (path, col, channel, type) => {
                  if (
                    path &&
                    !normalizedMediaList.some((m) => m.path === path || m.url === path)
                  ) {
                    let s3Url = path.startsWith("http") ? path : null;
                    if (!s3Url) {
                      if (col === "file_path") s3Url = alert.image_url || alert.file_path;
                      else if (col === "video_path") s3Url = alert.video_url || alert.video_path;
                      else if (col === "file_path_back") s3Url = alert.image_url_back || alert.file_path_back;
                      else if (col === "video_path_back") s3Url = alert.video_url_back || alert.video_path_back;
                    }

                    normalizedMediaList.push({
                      path,
                      url: s3Url || path,
                      column: col,
                      channel,
                      media_type: type,
                      file_name: path.split("/").pop(),
                    });
                  }
                };
                addIfMissing(alert.file_path, "file_path", 1, "image");
                addIfMissing(alert.video_path, "video_path", 1, "video");
                addIfMissing(
                  alert.file_path_back,
                  "file_path_back",
                  2,
                  "image",
                );
                addIfMissing(
                  alert.video_path_back,
                  "video_path_back",
                  2,
                  "video",
                );

                const frontImages = normalizedMediaList.filter(
                  (m) => m.channel === 1 && m.media_type === "image",
                );
                const frontVideos = normalizedMediaList.filter(
                  (m) => m.channel === 1 && m.media_type === "video",
                );
                const cabinImages = normalizedMediaList.filter(
                  (m) => m.channel === 2 && m.media_type === "image",
                );
                const cabinVideos = normalizedMediaList.filter(
                  (m) => m.channel === 2 && m.media_type === "video",
                );

                // const filePath = frontImages[0]?.path || null;
                // const videoPath = frontVideos[0]?.path || null;
                // const filePathBack = cabinImages[0]?.path || null;
                // const videoPathBack = cabinVideos[0]?.path || null;

                const filePath = frontImages[0]?.url || null;
                const videoPath = frontVideos[0]?.url || null;
                const filePathBack = cabinImages[0]?.url || null;
                const videoPathBack = cabinVideos[0]?.url || null;

                const rowKey = alert.id ? String(alert.id) : (alert.dedupe_key ? String(alert.dedupe_key) : (alert.serial_no ? String(alert.serial_no) : String(alert.time || "")));
                const isVideoDeleted = deleteVideoState[rowKey] === "deleted";
                const hasVideo = !isVideoDeleted && (frontVideos.length > 0 || cabinVideos.length > 0 || !!alert.video_path || !!alert.video_path_back || !!alert.video_url || !!alert.video_url_back);

                return (
                  <tr
                    key={alert.id || alert.dedupe_key || rowKey}
                    className="table-row-hover"
                    style={{ borderBottom: "1px solid #1e293b" }}
                  >
                    <td style={tdStyle}>
                      <div
                        style={{
                          fontWeight: "700",
                          color: "var(--text-primary)",
                        }}
                      >
                        {alert.deviceId}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {alert.time}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "800",
                          padding: "3px 8px",
                          borderRadius: "5px",
                          background: getCategoryStyle(alert.type).bg,
                          color: getCategoryStyle(alert.type).color,
                          border: `1px solid ${getCategoryStyle(alert.type).border}`,
                          textTransform: "uppercase",
                        }}
                      >
                        {alert.type || "AI"}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: "800",
                            color: "var(--text-primary)",
                            fontSize: "12px",
                            textTransform: "uppercase",
                          }}
                        >
                          {alert.friendly_name || "Unknown Event"}
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "var(--text-secondary)",
                            opacity: 0.7,
                            fontStyle: "italic",
                          }}
                        >
                          {alert.description || "No description available"}
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            color: "#64748b",
                            fontWeight: "bold",
                          }}
                        >
                          Code: {alert.event_code}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {(alert.request_video === true || alert.video_enabled === true) ? (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            padding: "3px 8px",
                            borderRadius: "5px",
                            background: "rgba(34, 197, 94, 0.15)",
                            color: "#22c55e",
                            border: "1px solid rgba(34, 197, 94, 0.3)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Video Enabled
                        </span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "700",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(148, 163, 184, 0.15)",
                              color: "#94a3b8",
                              border: "1px solid rgba(148, 163, 184, 0.3)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Video Disabled
                          </span>
                          {!hasVideo && (() => {
                            const itemDeviceIdKey = alert.device_id || alert.deviceId;
                            const isReqLoading = requestVideoState[rowKey] === "loading";
                            const isRequested = requestVideoState[rowKey] === "requested";

                            if (isRequested) {
                              return (
                                <span style={{ fontSize: "10px", color: "#22c55e", fontWeight: "700" }}>
                                  ✓ Requested
                                </span>
                              );
                            }

                            return (
                              <button
                                onClick={() => handleManualRequestVideo(alert)}
                                disabled={isReqLoading || !itemDeviceIdKey}
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  padding: "4px 8px",
                                  borderRadius: "5px",
                                  background: "#3b82f6",
                                  color: "#ffffff",
                                  border: "none",
                                  cursor: isReqLoading || !itemDeviceIdKey ? "not-allowed" : "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isReqLoading ? (
                                  <>
                                    <Loader2 size={10} className="animate-spin" />
                                    <span>Requesting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Video size={10} />
                                    <span>Request Video</span>
                                  </>
                                )}
                              </button>
                            );
                          })()}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {Math.round(alert.speed * 0.621371)} mph
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        {frontImages.length > 0 ? (
                          <button
                            onClick={() =>
                              onOpenMedia &&
                              onOpenMedia({
                                url: frontImages[0]?.url,
                                title: `${alert.message || alert.friendly_name} (Front Image)`,
                                time: alert.time,
                                deviceId: alert.deviceId,
                                type: "image",
                                mediaList: normalizedMediaList,
                                initialIndex: normalizedMediaList.indexOf(
                                  frontImages[0],
                                ),
                              })
                            }
                            className="media-btn image"
                            title="View Front Image"
                          >
                            <Image size={14} />
                          </button>
                        ) : (
                          <div
                            className="media-btn disabled"
                            title="No Front Image"
                          >
                            <Image size={14} />
                          </div>
                        )}
                        {frontVideos.length > 0 ? (
                          <button
                            onClick={() =>
                              onOpenMedia &&
                              onOpenMedia({
                                url: frontVideos[0]?.url,
                                title: `${alert.message || alert.friendly_name} (Front Video)`,
                                time: alert.time,
                                deviceId: alert.deviceId,
                                type: "video",
                                mediaList: normalizedMediaList,
                                initialIndex: normalizedMediaList.indexOf(
                                  frontVideos[0],
                                ),
                              })
                            }
                            className="media-btn video"
                            title="Play Front Video"
                          >
                            <PlaySquare size={14} />
                          </button>
                        ) : (
                          <div
                            className="media-btn disabled"
                            title="No Front Video"
                          >
                            <PlaySquare size={14} />
                          </div>
                        )}

                        {cabinImages.length > 0 ? (
                          <button
                            onClick={() =>
                              onOpenMedia &&
                              onOpenMedia({
                                url: cabinImages[0]?.url,
                                title: `${alert.message || alert.friendly_name} (Cabin/Back Image)`,
                                time: alert.time,
                                deviceId: alert.deviceId,
                                type: "image",
                                mediaList: normalizedMediaList,
                                initialIndex: normalizedMediaList.indexOf(
                                  cabinImages[0],
                                ),
                              })
                            }
                            className="media-btn cabin-image"
                            title="View Cabin Image"
                          >
                            <Image size={14} />
                          </button>
                        ) : (
                          <div
                            className="media-btn disabled"
                            title="No Cabin Image"
                          >
                            <Image size={14} />
                          </div>
                        )}

                        {cabinVideos.length > 0 ? (
                          <button
                            onClick={() =>
                              onOpenMedia &&
                              onOpenMedia({
                                url: cabinVideos[0]?.url,
                                title: `${alert.message || alert.friendly_name} (Cabin/Back Video)`,
                                time: alert.time,
                                deviceId: alert.deviceId,
                                type: "video",
                                mediaList: normalizedMediaList,
                                initialIndex: normalizedMediaList.indexOf(
                                  cabinVideos[0],
                                ),
                              })
                            }
                            className="media-btn cabin-video"
                            title="Play Cabin Video"
                          >
                            <PlaySquare size={14} />
                          </button>
                        ) : (
                          <div
                            className="media-btn disabled"
                            title="No Cabin Video"
                          >
                            <PlaySquare size={14} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        {filePath && (
                          <button
                            onClick={() =>
                              handleCopy(filePath, alert.id, "image")
                            }
                            style={{
                              background: "transparent",
                              border: "none",
                              color: isCopied(alert.id, "image")
                                ? "#22c55e"
                                : "#3b82f6",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              fontWeight: "600",
                              padding: "4px",
                              transition: "all 0.2s",
                            }}
                          >
                            {isCopied(alert.id, "image") ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                            Front Image
                          </button>
                        )}
                        {videoPath && (
                          <button
                            onClick={() =>
                              handleCopy(videoPath, alert.id, "video")
                            }
                            style={{
                              background: "transparent",
                              border: "none",
                              color: isCopied(alert.id, "video")
                                ? "#22c55e"
                                : "#22c55e",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              fontWeight: "600",
                              padding: "4px",
                              transition: "all 0.2s",
                            }}
                          >
                            {isCopied(alert.id, "video") ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                            Front Video
                          </button>
                        )}

                        {filePathBack && (
                          <button
                            onClick={() =>
                              handleCopy(filePathBack, alert.id, "image_back")
                            }
                            style={{
                              background: "transparent",
                              border: "none",
                              color: isCopied(alert.id, "image_back")
                                ? "#22c55e"
                                : "#a855f7",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              fontWeight: "600",
                              padding: "4px",
                              transition: "all 0.2s",
                            }}
                          >
                            {isCopied(alert.id, "image_back") ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                            Cabin Image
                          </button>
                        )}
                        {videoPathBack && (
                          <button
                            onClick={() =>
                              handleCopy(videoPathBack, alert.id, "video_back")
                            }
                            style={{
                              background: "transparent",
                              border: "none",
                              color: isCopied(alert.id, "video_back")
                                ? "#22c55e"
                                : "#eab308",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                              fontWeight: "600",
                              padding: "4px",
                              transition: "all 0.2s",
                            }}
                          >
                            {isCopied(alert.id, "video_back") ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                            Cabin Video
                          </button>
                        )}

                        {!filePath &&
                          !videoPath &&
                          !filePathBack &&
                          !videoPathBack && (
                            <span
                              style={{ color: "#475569", fontSize: "11px" }}
                            >
                              No Links
                            </span>
                          )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {hasVideo ? (
                        <button
                          onClick={() => handleDeleteVideo(alert)}
                          disabled={deleteVideoState[rowKey] === "deleting"}
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            padding: "4px 8px",
                            borderRadius: "5px",
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "#ef4444",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            cursor: deleteVideoState[rowKey] === "deleting" ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                          }}
                          title="Delete video record from database so it can be re-requested"
                        >
                          {deleteVideoState[rowKey] === "deleting" ? (
                            <>
                              <Loader2 size={10} className="animate-spin" />
                              <span>Deleting...</span>
                            </>
                          ) : (
                            <>
                              <Trash2 size={10} />
                              <span>Delete Video</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span style={{ fontSize: "11px", color: "#475569" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan="9"
                  style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "#475569",
                  }}
                >
                  No notifications found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && pagination.totalPages > 1 && (
        <div
          style={{
            padding: "12px 20px",
            background: "var(--header-bg)",
            borderTop: "1px solid var(--surface-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Page <strong>{pagination.page}</strong> of{" "}
            <strong>{pagination.totalPages}</strong>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                background: pagination.hasPrev
                  ? "var(--btn-primary-bg)"
                  : "var(--btn-disabled-bg)",
                border: "1px solid var(--surface-border)",
                color: pagination.hasPrev
                  ? "var(--text-primary)"
                  : "var(--text-disabled)",
                cursor: pagination.hasPrev ? "pointer" : "not-allowed",
                fontSize: "12px",
                fontWeight: "600",
                transition: "all 0.2s",
              }}
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!pagination.hasNext}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                background: pagination.hasNext
                  ? "var(--btn-primary-bg)"
                  : "var(--btn-disabled-bg)",
                border: "1px solid var(--surface-border)",
                color: pagination.hasNext
                  ? "var(--text-primary)"
                  : "var(--text-disabled)",
                cursor: pagination.hasNext ? "pointer" : "not-allowed",
                fontSize: "12px",
                fontWeight: "600",
                transition: "all 0.2s",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <style>
        {`
          .th-style {
            padding: 12px 20px;
            font-weight: 700;
            color: #94a3b8;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.5px;
          }
          .td-style {
            padding: 12px 20px;
          }
          .table-row-hover:hover {
            background: rgba(59, 130, 246, 0.05);
          }
          .media-btn {
            width: 30px;
            height: 30px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid transparent;
          }
          .media-btn.image {
            background: #3b82f615;
            color: #3b82f6;
            border-color: #3b82f633;
          }
          .media-btn.video {
            background: #22c55e15;
            color: #22c55e;
            border-color: #22c55e33;
          }
          .media-btn.cabin-image {
            background: #a855f715;
            color: #a855f7;
            border-color: #a855f733;
          }
          .media-btn.cabin-video {
            background: #eab30815;
            color: #eab308;
            border-color: #eab30833;
          }
          .media-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .media-btn.disabled {
            background: #1e293b;
            color: #475569;
            cursor: not-allowed;
            opacity: 0.5;
          }
        `}
      </style>
    </div>
  );
}

const thStyle = {
  padding: "12px 12px", // Reduced padding to fit more content
  fontWeight: "700",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  fontSize: "11px",
  letterSpacing: "0.5px",
  borderBottom: "1px solid var(--surface-border)",
  background: "var(--card-bg)",
};

const tdStyle = {
  padding: "12px 12px", // Reduced padding
};
