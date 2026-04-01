import { useState, useEffect, useRef, useCallback } from "react"
import { marked } from "marked"
import { electronAPI } from "../lib/electron-api"

// ---------------------------------------------------------------------------
// API constants
// ---------------------------------------------------------------------------

const SKILLS_SH_API = "https://skills.sh/api"

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

interface SkillsShSearchResponse {
  skills: CatalogSkill[]
  count: number
}

// ---------------------------------------------------------------------------
// Default branch cache (avoids repeated GitHub API calls per repo)
// ---------------------------------------------------------------------------

const defaultBranchCache = new Map<string, string>()

async function getDefaultBranch(source: string): Promise<string> {
  const cached = defaultBranchCache.get(source)
  if (cached) return cached

  try {
    const res = await fetch(`https://api.github.com/repos/${source}`)
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = await res.json()
    const branch = data.default_branch || "main"
    defaultBranchCache.set(source, branch)
    return branch
  } catch {
    // Fall back to "main" if the API call fails
    return "main"
  }
}

// ---------------------------------------------------------------------------
// Fetch SKILL.md content from GitHub raw, trying multiple paths
// ---------------------------------------------------------------------------

async function fetchSkillContent(
  source: string,
  skillId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const branch = await getDefaultBranch(source)
  const baseUrl = `https://raw.githubusercontent.com/${source}/${branch}`

  const pathsToTry = [
    `skills/${skillId}/SKILL.md`,
    `skills/.curated/${skillId}/SKILL.md`,
    `skills/.experimental/${skillId}/SKILL.md`,
    `${skillId}/SKILL.md`,
    `SKILL.md`,
  ]

  for (const p of pathsToTry) {
    try {
      const res = await fetch(`${baseUrl}/${p}`, { signal })
      if (res.ok) {
        return await res.text()
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null
      // Continue to next path
    }
  }

  return null
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
  const [installed, setInstalled] = useState(
    installedNames.has(skill.name.toLowerCase()),
  )

  // Fetch SKILL.md content from GitHub raw
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setContent(null)

    fetchSkillContent(skill.source, skill.skillId, controller.signal)
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
      controller.abort()
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
    try {
      await onInstall(skill.source, selectedAgents)
      setInstalled(true)
    } catch (err) {
      console.error("Install failed:", err)
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
              <div>
                <p className="text-[12px] font-medium text-foreground mb-2">
                  Install targets
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {availableAgents.map((agent) => (
                    <label
                      key={agent.name}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAgents.includes(agent.name)}
                        onChange={() => toggleAgent(agent.name)}
                      />
                      <span>{agent.displayName}</span>
                      {defaultAgents.includes(agent.name) && (
                        <span className="ml-auto text-[10px] text-muted">default</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
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
  const [searchQuery, setSearchQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [total, setTotal] = useState(0)
  const [selectedSkill, setSelectedSkill] = useState<CatalogSkill | null>(null)
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const LIMIT = 30

  // Load installed skills to mark installed state
  useEffect(() => {
    electronAPI.listInstalled().then((installed) => {
      const names = new Set(installed.map((s) => s.name.toLowerCase()))
      setInstalledNames(names)
    })
  }, [])

  // Initial catalog load (empty query returns popular skills)
  useEffect(() => {
    fetchSkills("")
  }, [])

  async function fetchSkills(query: string) {
    if (abortRef.current) abortRef.current.abort()

    const controller = new AbortController()
    abortRef.current = controller

    const isInitialLoad = !query.trim()
    if (isInitialLoad) {
      setLoading(true)
    } else {
      setSearching(true)
    }
    setError(null)

    try {
      const url = `${SKILLS_SH_API}/search?q=${encodeURIComponent(query)}&limit=${LIMIT}`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SkillsShSearchResponse = await res.json()

      setSkills(data.skills)
      setTotal(data.count)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setError(
        isInitialLoad
          ? "Failed to load catalog. Check your connection."
          : "Search failed. Please try again.",
      )
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (!value.trim()) {
      fetchSkills("")
    }
  }, [])

  const handleSearchSubmit = useCallback(() => {
    if (!searchQuery.trim()) return
    fetchSkills(searchQuery.trim())
  }, [searchQuery])

  async function handleInstall(source: string, _agentNames: string[]) {
    const results = await electronAPI.installSkill(source, _agentNames, "global")
    const hasError = results.some((r) => !r.success)
    if (hasError) {
      const errorMsg = results
        .filter((r) => !r.success)
        .map((r) => r.error)
        .join(", ")
      throw new Error(errorMsg)
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
          Browse and search skills.{" "}
          {total > 0 && !searchQuery.trim() && (
            <span className="font-mono">{total} skills available</span>
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
          {(searching || loading) && (
            <div className="absolute inset-y-0 right-3 flex items-center">
              <SpinnerIcon />
            </div>
          )}
          {searchQuery && !searching && (
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
        {searchQuery.trim() && !searching && (
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
      <div className="flex-1 overflow-y-auto px-8 pb-8">
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
