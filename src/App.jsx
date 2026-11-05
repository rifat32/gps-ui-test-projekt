import { lazy, useEffect, useState, Suspense } from "react";
import { Route, BrowserRouter as Router, Routes, Navigate } from "react-router-dom";

import "./App.css";
const LiveTracker = lazy(() => import("./pages/LiveTracker"));
const AiDashcam = lazy(() => import("./pages/Dashcam"));
const Playback = lazy(() => import("./pages/Playback"));
const SavedVideos = lazy(() => import("./pages/SavedVideos"));
const VideoSettings = lazy(() => import("./pages/VideoSettings"));
const AiVideoSettings = lazy(() => import("./pages/AiVideoSettings"));
const Layout = lazy(() => import("./components/Layout"));
const AiNotifications = lazy(() => import("./pages/AiNotifications"));
const SystemAlertsLog = lazy(() => import("./pages/SystemAlertsLog"));
const Logs = lazy(() => import("./pages/Logs"));
const DeviceSignals = lazy(() => import("./pages/DeviceSignals"));
const DeviceManagement = lazy(() => import("./pages/DeviceManagement"));
const ObdPlayback = lazy(() => import("./pages/ObdPlayback"));
const ObdStatus = lazy(() => import("./pages/ObdStatus"));
const J42Status = lazy(() => import("./pages/J42Status"));
const MediaLogs = lazy(() => import("./pages/MediaLogs"));
const MediaGallery = lazy(() => import("./pages/MediaGallery"));
const VehicleHealth = lazy(() => import("./pages/VehicleHealth"));
const ContainerLogs = lazy(() => import("./pages/ContainerLogs"));
const RemoteAccess = lazy(() => import("./pages/RemoteAccess"));
const RemoteAccessV2 = lazy(() => import("./pages/RemoteAccessV2"));
const DeviceCommands = lazy(() => import("./pages/DeviceCommands"));
const DeploymentInfo = lazy(() => import("./pages/DeploymentInfo"));


import LoginPage from "./pages/Auth/LoginPage";
import authApi from "./services/authApi";

function PrivateRoute({ children }) {
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const isAuthenticated = !!user?.accessToken;
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }


  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f1016] p-8 text-white font-sans">
        <div className="bg-white/5 backdrop-blur-xl p-12 rounded-[32px] shadow-2xl text-center max-w-md border border-white/10">
          <div className="text-amber-500 text-7xl mb-8">🛡️</div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">Elevated Access Required</h1>
          <p className="text-white/60 mb-10 leading-relaxed text-lg">
            This terminal is restricted to <strong>Super Administrators</strong>. 
            Your current permissions are insufficient for this operational area.
          </p>
          <div className="flex flex-col gap-4">
            <button 
              onClick={() => authApi.logout() || window.location.reload()}
              className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-900/20"
            >
              Sign Out / Switch Operator
            </button>
            <button 
              onClick={() => window.location.href = "/"}
              className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all duration-300"
            >
              Return to Fleet Portal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "light";
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
    if (theme === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <Router>
      <Suspense fallback={<div className="p-4">Loading Fleet Pro...</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={

            <PrivateRoute>
              <Layout theme={theme} toggleTheme={toggleTheme} />
            </PrivateRoute>
          }>
            <Route
              path="/playback"
              element={<Playback theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/dashcam"
              element={<AiDashcam theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/saved-videos"
              element={<SavedVideos theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/video-settings"
              element={<VideoSettings theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/ai-video-settings"
              element={<AiVideoSettings theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/logs"
              element={<Logs theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/device-signals"
              element={<DeviceSignals theme={theme} toggleTheme={toggleTheme} />}
            />

            <Route
              path="/devices"
              element={<DeviceManagement theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/media-logs"
              element={<MediaLogs theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/media-gallery"
              element={<MediaGallery theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/vehicle-health"
              element={<VehicleHealth theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/container-logs"
              element={<ContainerLogs theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/remote-access"
              element={<RemoteAccess theme={theme} />}
            />
            <Route
              path="/remote-access-v2"
              element={<RemoteAccessV2 theme={theme} />}
            />
            <Route
              path="/device-commands"
              element={<DeviceCommands theme={theme} />}
            />
            <Route
              path="/deployment-info"
              element={<DeploymentInfo theme={theme} toggleTheme={toggleTheme} />}
            />



            <Route
              path="/ai-notifications"
              element={
                <AiNotifications theme={theme} toggleTheme={toggleTheme} />
              }
            />
            <Route
              path="/system-alerts"
              element={
                <SystemAlertsLog theme={theme} toggleTheme={toggleTheme} />
              }
            />
            <Route
              path="/obd-live"
              element={<LiveTracker theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/obd-playback"
              element={<ObdPlayback theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/obd-status"
              element={<ObdStatus theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/j42-status"
              element={<J42Status theme={theme} toggleTheme={toggleTheme} />}
            />
            <Route
              path="/"
              element={<LiveTracker theme={theme} toggleTheme={toggleTheme} />}
            />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
