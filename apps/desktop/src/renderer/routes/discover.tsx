import { useState, useEffect, useRef, useCallback } from "react"
import { marked } from "marked"
import { electronAPI } from "../lib/electron-api"

// ---------------------------------------------------------------------------
// Types matching the skills.sh response shape
// ---------------------------------------------------------------------------

interface CatalogSkill {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatInstalls(installs: number): string {
  if (installs >= 1000) {
    return `${(installs / 1000).toFixed(1).replace(/\.0$/, "")}k`
  }
  return String(installs)
}

// Configure marked for synchronous rendering
marked.setOptions({ async: false, breaks: true, gfm: true })

function sanitizeHtml(html: string): string {
  let clean = html.replace(
    /<(script|iframe|object|embed|form|style)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi,
    ""
  )
  clean = clean.replace(/<(script|iframe|object|embed|link)\b[^>]*\/?>/gi, "")
  clean = clean.replace(
    /\s+on\w+\s*=\s*["']?[^"'>\s]*["']?/gi,
    ""
  )
  clean = clean.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="')
  clean = clean.replace(/src\s*=\s*["']?\s*javascript:/gi, 'src="')
  return clean
}

function renderMarkdown(raw: string): string {
  let content = raw
  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3)
    if (endIdx !== -1) {
      content = content.slice(endIdx + 3).trim()
    }
  }
  return sanitizeHtml(marked.parse(content) as string)
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
  )
}

function InstallsIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Skill Card (catalog grid item)
// ---------------------------------------------------------------------------

interface SkillCardProps {
  skill: CatalogSkill
  onSelect: (skill: CatalogSkill) => void
  installedNames: Set<string>
}

function SkillCard({ skill, onSelect, installedNames }: SkillCardProps) {
  const isInstalled = installedNames.has(skill.name.toLowerCase())

  return (
    <button
      onClick={() => onSelect(skill)}
      className="text-left w-full p-4 rounded-lg border border-border bg-surface hover:border-accent/30 hover:bg-surface-hover transition-all duration-200 group"
    >
      {/* Name + installs row */}
      <div className="flex items-center gap-2 mb-1.5">
        <h3 className="text-[13px] font-semibold text-foreground truncate">
          {skill.name}
        </h3>
        {isInstalled && (
          <span className="text-[9px] uppercase tracking-wider font-medium text-accent bg-surface-hover px-1.5 py-0.5 rounded flex-shrink-0">
            installed
          </span>
        )}
        {skill.installs > 0 && (
          <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono text-muted ml-auto">
            <InstallsIcon />
            {formatInstalls(skill.installs)}
          </span>
        )}
      </div>

      {/* Source (owner/repo) */}
      <p className="text-[11px] text-muted font-mono truncate">
        {skill.source}
      </p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Agent Dropdown (multi-select for install targets)
// ---------------------------------------------------------------------------

interface DetectedAgent {
  name: string
  displayName: string
}

function AgentDropdown({
  agents,
  selected,
  defaults,
  onToggle,
}: {
  agents: DetectedAgent[]
  selected: string[]
  defaults: string[]
  onToggle: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const label =
    selected.length === 0
      ? "No agents selected"
      : selected.length === agents.length
        ? `All agents (${agents.length})`
        : `${selected.length} agent${selected.length > 1 ? "s" : ""} selected`

  return (
    <div ref={ref} className="relative">
      <p className="text-[12px] font-medium text-foreground mb-2">
        Install targets
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-foreground hover:border-accent/30 transition-colors"
      >
        <span>{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-background shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto py-1">
            {agents.map((agent) => (
              <button
                key={agent.name}
                type="button"
                onClick={() => onToggle(agent.name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-foreground hover:bg-surface-hover transition-colors"
              >
                <span
                  className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    selected.includes(agent.name)
                      ? "bg-accent border-accent text-background"
                      : "border-border"
                  }`}
                >
                  {selected.includes(agent.name) && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span>{agent.displayName}</span>
                {defaults.includes(agent.name) && (
                  <span className="ml-auto text-[10px] text-muted">default</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skill Detail Panel (slide-over from the right)
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  skill: CatalogSkill
  onClose: () => void
  installedNames: Set<string>
  onInstall: (source: string, agentNames: string[]) => Promise<void>
}

function DetailPanel({ skill, onClose, installedNames, onInstall }: DetailPanelProps) {
  const [availableAgents, setAvailableAgents] = useState<DetectedAgent[]>([])
  const [defaultAgents, setDefaultAgents] = useState<string[]>([])
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installed, setInstalled] = useState(
    installedNames.has(skill.name.toLowerCase()),
  )

  // Fetch SKILL.md content from GitHub raw
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setContent(null)

    electronAPI.fetchSkillContent(skill.source, skill.skillId)
      .then((text) => {
        if (!cancelled) {
          setContent(text)
        }
      })
      .catch(() => {
        if (!cancelled) setContent(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [skill.source, skill.skillId])

  // Sync installed state when prop changes
  useEffect(() => {
    setInstalled(installedNames.has(skill.name.toLowerCase()))
  }, [installedNames, skill.name])

  useEffect(() => {
    let cancelled = false
    Promise.all([electronAPI.detectAgents(), electronAPI.settingsAll()])
      .then(([agents, settings]) => {
        if (cancelled) return
        setAvailableAgents(agents)
        const defaults = (settings["install.defaultAgents"] as string[]) || agents.map((agent) => agent.name)
        setDefaultAgents(defaults)
        setSelectedAgents(defaults)
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableAgents([])
          setDefaultAgents([])
          setSelectedAgents([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [skill.skillId])

  async function handleInstall() {
    if (!skill.source) return

    setInstalling(true)
    setInstallError(null)
    try {
      await onInstall(skill.source, selectedAgents)
      setInstalled(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setInstallError(msg)
    } finally {
      setInstalling(false)
    }
  }

  function toggleAgent(name: string) {
    setSelectedAgents((prev) =>
      prev.includes(name)
        ? prev.filter((value) => value !== name)
        : [...prev, name],
    )
  }

  const githubUrl = `https://github.com/${skill.source}`

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="w-[560px] max-w-[90vw] flex flex-col bg-background border-l border-border overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <ArrowLeftIcon />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">
              {skill.name}
            </h2>
          </div>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-foreground transition-colors"
          >
            GitHub <ExternalLinkIcon />
          </a>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Meta */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-mono text-muted">
                {skill.source}
              </span>
              {skill.installs > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-muted">
                  <InstallsIcon /> {formatInstalls(skill.installs)} installs
                </span>
              )}
            </div>

            {/* Install button */}
            <div className="flex items-center gap-3 mb-4">
              {installed ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium bg-surface-hover text-muted border border-border">
                  <CheckIcon /> Installed
                </span>
              ) : (
                <button
                  onClick={handleInstall}
                  disabled={installing || selectedAgents.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {installing ? (
                    <>
                      <SpinnerIcon /> Installing...
                    </>
                  ) : (
                    <>
                      <DownloadIcon /> Install
                    </>
                  )}
                </button>
              )}

              <code className="text-[11px] font-mono text-muted bg-surface px-2.5 py-1.5 rounded border border-border">
                $ npx skills add {skill.source}
              </code>
            </div>

            {!installed && availableAgents.length > 0 && (
              <AgentDropdown
                agents={availableAgents}
                selected={selectedAgents}
                defaults={defaultAgents}
                onToggle={toggleAgent}
              />
            )}

            {installError && (
              <p className="text-[12px] text-red-400 mt-3">{installError}</p>
            )}
          </div>

          <hr className="border-border mb-5" />

          {/* Markdown content */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <SpinnerIcon />
            </div>
          ) : content ? (
            <div
              className="skill-prose text-[13px]"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ) : (
            <p className="text-sm text-muted">
              Skill content not available.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Discover (main export)
// ---------------------------------------------------------------------------

export function Discover() {
  const [skills, setSkills] = useState<CatalogSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeQuery, setActiveQuery] = useState("skill")
  const [selectedSkill, setSelectedSkill] = useState<CatalogSkill | null>(null)
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const LIMIT = 30
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load installed skills to mark installed state
  useEffect(() => {
    electronAPI.listInstalled().then((installed) => {
      const names = new Set(installed.map((s) => s.name.toLowerCase()))
      setInstalledNames(names)
    })
  }, [])

  // Initial catalog load
  useEffect(() => {
    fetchSkills("skill", 0)
  }, [])

  async function fetchSkills(query: string, offset: number) {
    const isNewSearch = offset === 0
    if (isNewSearch) {
      setLoading(true)
      setActiveQuery(query)
    } else {
      setLoadingMore(true)
    }
    setError(null)

    try {
      const q = query.trim().length >= 2 ? query.trim() : "skill"
      const data = await electronAPI.searchCatalog(q, LIMIT, offset)

      if (isNewSearch) {
        setSkills(data.skills)
      } else {
        setSkills((prev) => [...prev, ...data.skills])
      }
      setHasMore(data.count >= LIMIT)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Search failed: ${msg}`)
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
  }, [])

  const handleSearchSubmit = useCallback(() => {
    const q = searchQuery.trim()
    fetchSkills(q.length >= 2 ? q : "skill", 0)
  }, [searchQuery])

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    fetchSkills(activeQuery, skills.length)
  }, [loadingMore, hasMore, activeQuery, skills.length])

  // Infinite scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onScroll() {
      if (!el || loadingMore || !hasMore) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight - scrollTop - clientHeight < 200) {
        handleLoadMore()
      }
    }

    el.addEventListener("scroll", onScroll)
    return () => el.removeEventListener("scroll", onScroll)
  }, [handleLoadMore, loadingMore, hasMore])

  async function handleInstall(source: string, _agentNames: string[]) {
    // Use npx skills add for skills.sh sources — handles content-based install
    // (Chops pattern) without cloning entire repos
    const result = await electronAPI.installSkillViaCli(source)
    if (!result.success) {
      throw new Error(result.error || "Install failed")
    }

    // Refresh installed skills list
    const installed = await electronAPI.listInstalled()
    setInstalledNames(new Set(installed.map((s) => s.name.toLowerCase())))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-6 pb-4">
        <h2 className="text-xl font-bold text-foreground mb-1">Discover</h2>
        <p className="text-[12px] text-muted mb-5">
          Browse and search skills from skills.sh.{" "}
          {skills.length > 0 && (
            <span className="font-mono">{skills.length} skills loaded</span>
          )}
        </p>

        <div className="relative max-w-xl">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <SearchIcon size={15} />
          </div>
          <input
            type="text"
            placeholder="Search by name or keyword... (Enter to search)"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit() }}
            className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-surface border border-border text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-accent/40 transition-colors"
          />
          {loading && (
            <div className="absolute inset-y-0 right-3 flex items-center">
              <SpinnerIcon />
            </div>
          )}
          {searchQuery && !loading && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute inset-y-0 right-3 flex items-center text-muted hover:text-foreground transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Results count when searching */}
        {searchQuery.trim() && !loading && (
          <p className="mt-2 text-[11px] text-muted font-mono">
            {skills.length} result{skills.length !== 1 ? "s" : ""} for "{searchQuery.trim()}"
          </p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-8 pb-3">
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 pb-8">
        {loading && skills.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <SpinnerIcon />
              <p className="text-muted text-[12px] mt-3">
                Loading catalog...
              </p>
            </div>
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-4 text-muted"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="text-muted text-sm">
              No skills found{searchQuery.trim() ? ` for "${searchQuery.trim()}"` : ""}.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onSelect={setSelectedSkill}
                  installedNames={installedNames}
                />
              ))}
            </div>
            {loadingMore && (
              <div className="flex justify-center py-6">
                <SpinnerIcon />
              </div>
            )}
            {!hasMore && skills.length > 0 && (
              <p className="text-center text-[11px] text-muted py-4">
                No more results
              </p>
            )}
          </>
        )}
      </div>

      {/* Detail panel overlay */}
      {selectedSkill && (
        <DetailPanel
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          installedNames={installedNames}
          onInstall={handleInstall}
        />
      )}
    </div>
  )
}
