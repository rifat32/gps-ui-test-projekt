import {
  Map as MapIcon,
  Video,
  History,
  Settings,
  PlayCircle,
  LayoutDashboard,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  FileText,
  Cpu,
  Image as ImageIcon,
  ShieldAlert,
  Terminal,
  MonitorSmartphone,
  Command,
  CloudUpload,
  Zap,
  Sliders,
  Radio,
} from "lucide-react";

import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import authApi from "../services/authApi";

const NAV_ITEMS = [
  { path: "/", icon: MapIcon, label: "Live Tracker" },
  { path: "/dashcam", icon: LayoutDashboard, label: "AI Dashcam" },
  { path: "/ai-notifications", icon: Bell, label: "AI Notifications" },
  { path: "/system-alerts", icon: ShieldAlert, label: "System Alerts Log" },
  { path: "/playback", icon: PlayCircle, label: "History Playback" },
  { path: "/obd-playback", icon: History, label: "OBD Playback" },
  { path: "/obd-status", icon: LayoutDashboard, label: "OBD Status" },
  { path: "/j42-status", icon: LayoutDashboard, label: "J42 Status" },
  { path: "/saved-videos", icon: History, label: "Media Center" },
  { path: "/video-settings", icon: Settings, label: "Configuration" },
  { path: "/ai-video-settings", icon: Sliders, label: "AI Video Settings" },
  { path: "/devices", icon: Cpu, label: "Device Management" },
  { path: "/device-signals", icon: Radio, label: "Device Raw Signals (Kafka)" },
  { path: "/logs", icon: FileText, label: "System Logs" },
  { path: "/media-logs", icon: FileText, label: "Media Logs" },
  { path: "/media-gallery", icon: ImageIcon, label: "Media Gallery" },
  { path: "/vehicle-health", icon: ShieldAlert, label: "Vehicle Health" },
  { path: "/remote-access", icon: MonitorSmartphone, label: "Remote Access" },
  { path: "/remote-access-v2", icon: MonitorSmartphone, label: "Remote Access V2" },
  { path: "/device-commands", icon: Command, label: "Device Commands" },
  { path: "/deployment-info", icon: CloudUpload, label: "Deployment Info" },
];

export default function NavigationSidebar() {
  const location = useLocation();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth <= 1280);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [user] = useState(() => {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth <= 1280 && window.innerWidth > 1024) {
        setIsCollapsed(true);
      } else if (window.innerWidth > 1280) {
        setIsCollapsed(false);
      }
      if (window.innerWidth > 1024) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isActive = (path) => location.pathname === path;
  const effectiveIsCollapsed = isCollapsed && windowWidth > 1024;

  return (
    <>
      {/* Mobile Toggle Button */}
      {!isMobileOpen && (
        <button
          className="mobile-nav-toggle"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={24} />
        </button>
      )}

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div className="nav-overlay" onClick={() => setIsMobileOpen(false)} />
      )}

      <aside
        className={`nav-sidebar ${effectiveIsCollapsed ? "collapsed" : ""} ${isMobileOpen ? "mobile-open" : ""}`}
      >
        <div className="nav-logo">
          <div className="logo-wrap">
            <div className="logo-icon">GPS</div>
            {!effectiveIsCollapsed && <span className="logo-text">FLEET PRO</span>}
          </div>
          {isMobileOpen && (
            <button
              className="mobile-nav-close"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close navigation menu"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <nav className="nav-items">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? "active" : ""}`}
              title={effectiveIsCollapsed ? item.label : ""}
              onClick={() => setIsMobileOpen(false)}
            >
              <item.icon size={20} className="nav-icon" />
              {!effectiveIsCollapsed && <span className="nav-label">{item.label}</span>}
              {isActive(item.path) && !effectiveIsCollapsed && (
                <div className="active-indicator" />
              )}
            </Link>
          ))}
        </nav>

        <div className="nav-footer">
          <button
            className="collapse-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {effectiveIsCollapsed ? (
              <ChevronRight size={18} />
            ) : (
              <>
                <ChevronLeft size={18} />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>

          <div className="user-profile">
            <div className="avatar">{(user?.name || "A")[0]}</div>
            {!effectiveIsCollapsed && (
              <div className="user-info">
                <span className="user-name">{user?.name || "Admin User"}</span>
                <span className="user-role">{user?.role || "Super Admin"}</span>
              </div>
            )}
          </div>

          <button 
            className={`logout-full-btn ${effectiveIsCollapsed ? 'collapsed' : ''}`}
            onClick={() => { authApi.logout(); window.location.reload(); }}
          >
            <LogOut size={18} />
            {!effectiveIsCollapsed && <span>Sign Out System</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
