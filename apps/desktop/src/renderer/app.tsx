import { HashRouter, Routes, Route } from "react-router-dom"
import { Sidebar } from "./components/sidebar"
import { Home } from "./routes/home"
import { Discover } from "./routes/discover"
import { Servers } from "./routes/servers"
import { ServerSkills } from "./routes/server-skills"
import { Settings } from "./routes/settings"
import { ScanSources } from "./routes/scan-sources"

export function App() {
  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/discover" element={<div className="flex-1 overflow-y-auto"><Discover /></div>} />
            <Route path="/servers" element={<div className="flex-1 overflow-y-auto"><Servers /></div>} />
            <Route path="/servers/:id/skills" element={<ServerSkills />} />
            <Route path="/scan-sources" element={<ScanSources />} />
            <Route path="/settings" element={<div className="flex-1 overflow-y-auto"><Settings /></div>} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
