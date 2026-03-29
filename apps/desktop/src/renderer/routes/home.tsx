import { useEffect, useState, useMemo, useCallback } from "react"
import { marked } from "marked"
import { electronAPI } from "../lib/electron-api"

// Agent color mapping for dot badges
const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#D97706",
  cursor: "#2563EB",
  "github-copilot": "#6366F1",
  windsurf: "#0891B2",
  cline: "#7C3AED",
  continue: "#059669",
  "codex-cli": "#DC2626",
  amp: "#EA580C",
  goose: "#4F46E5",
  junie: "#B45309",
  "kilo-code": "#0369A1",
  opencode: "#0D9488",
  openclaw: "#6D28D9",
  "pear-ai": "#65A30D",
  "roo-code": "#C026D3",
  trae: "#0284C7",
  zed: "#CA8A04",
  universal: "#78716C",
}

// Map display names to registry keys for color lookup
const DISPLAY_NAME_TO_KEY: Record<string, string> = {
  "Claude Code": "claude-code",
  Cursor: "cursor",
  "GitHub Copilot": "github-copilot",
  Windsurf: "windsurf",
  Cline: "cline",
  Continue: "continue",
  "Codex CLI": "codex-cli",
  Amp: "amp",
  Goose: "goose",
  Junie: "junie",
  "Kilo Code": "kilo-code",
  OpenCode: "opencode",
  OpenClaw: "openclaw",
  "Pear AI": "pear-ai",
  "Roo Code": "roo-code",
  Trae: "trae",
  Zed: "zed",
  "Universal (.agents/skills)": "universal",
}

function getAgentColor(displayName: string): string {
  const key = DISPLAY_NAME_TO_KEY[displayName] || displayName.toLowerCase().replace(/\s+/g, "-")
  return AGENT_COLORS[key] || "#78716C"
}

function AgentDots({ agents }: { agents: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {agents.map((agent) => (
        <span
          key={agent}
          title={agent}
          className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
          style={{ backgroundColor: getAgentColor(agent) }}
        />
      ))}
    </span>
  )
}

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

function SkillsGateIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 64 64" className="text-muted">
      <g transform="translate(8, 8)">
        <path d="M16 2 L4 2 C2 2 1 4 1 6 L1 42 C1 44 2 46 4 46 L16 46" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M32 2 L44 2 C46 2 47 4 47 6 L47 42 C47 44 46 46 44 46 L32 46" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="24" cy="14" r="3.5" fill="currentColor"/>
        <circle cx="24" cy="24" r="3.5" fill="currentColor"/>
        <circle cx="24" cy="34" r="3.5" fill="currentColor"/>
      </g>
    </svg>
  )
}

function SourceBadge({ sourceType }: { sourceType?: string }) {
  if (!sourceType) return null
  const label =
    sourceType === "github"
      ? "github"
      : sourceType === "skillsgate"
        ? "skillsgate"
        : "local"
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-hover text-muted border border-border">
      {label}
    </span>
  )
}

// Configure marked for synchronous rendering
marked.setOptions({
  async: false,
  breaks: true,
  gfm: true,
})

function sanitizeHtml(html: string): string {
  let clean = html.replace(
    /<(script|iframe|object|embed|form|style)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi,
    ""
  )
  clean = clean.replace(/<(script|iframe|object|embed|link)\b[^>]*\/?>/gi, "")
  clean = clean.replace(
    /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    ""
  )
  clean = clean.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="')
  clean = clean.replace(/src\s*=\s*["']?\s*javascript:/gi, 'src="')
  clean = clean.replace(/data\s*=\s*["']?\s*javascript:/gi, 'data="')
  return clean
}

function renderMarkdown(raw: string): string {
  // Strip frontmatter before rendering
  let content = raw
  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3)
    if (endIdx !== -1) {
      content = content.slice(endIdx + 3).trim()
    }
  }
  return sanitizeHtml(marked.parse(content) as string)
}

interface DragSkillPayload {
  name: string
  canonicalPath: string
}

interface DragToast {
  type: "success" | "error"
  message: string
}

// --------------------------------------------------------------------------
// Left Sidebar Panel
// --------------------------------------------------------------------------

interface LeftSidebarProps {
  totalSkillCount: number
  agentsWithSkills: DetectedAgent[]
  agentSkillCounts: Record<string, number>
  selectedAgent: string | null
  onSelectAgent: (agent: string | null) => void
  activeFilter: "all" | "favorites"
  onFilterChange: (filter: "all" | "favorites") => void
  collections: Record<string, string[]>
  collectionCounts: Record<string, number>
  selectedCollection: string | null
  onSelectCollection: (collection: string | null) => void
  onCreateCollection: () => void
  onRenameCollection: (name: string) => void
  onDeleteCollection: (name: string) => void
  dragSkill: DragSkillPayload | null
  dragOverTarget: string | null
  onDragEnterTarget: (target: string | null) => void
  onDropOnAgent: (agentDisplayName: string) => void
  onDropOnCollection: (collectionName: string) => void
}

function LeftSidebar({
  totalSkillCount,
  agentsWithSkills,
  agentSkillCounts,
  selectedAgent,
  onSelectAgent,
  activeFilter,
  onFilterChange,
  collections,
  collectionCounts,
  selectedCollection,
  onSelectCollection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  dragSkill,
  dragOverTarget,
  onDragEnterTarget,
  onDropOnAgent,
  onDropOnCollection,
}: LeftSidebarProps) {
  return (
    <aside className="w-48 flex-shrink-0 flex flex-col bg-surface border-r border-border overflow-y-auto">
      {/* Library section */}
      <div className="px-3 pt-4 pb-2">
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-muted mb-2 px-2">
          Library
        </h3>
        <nav className="flex flex-col gap-0.5">
          <button
            onClick={() => {
              onFilterChange("all")
              onSelectAgent(null)
            }}
            className={`flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] tracking-wide font-medium transition-colors text-left ${
              activeFilter === "all" && selectedAgent === null
                ? "bg-surface-hover text-foreground"
                : "text-muted hover:text-foreground hover:bg-surface-hover"
            }`}
          >
            <span>All Skills</span>
            <span
              className={`text-[10px] font-mono ${
                activeFilter === "all" && selectedAgent === null
                  ? "text-foreground"
                  : "text-muted"
              }`}
            >
              {totalSkillCount}
            </span>
          </button>
          <button
            onClick={() => onFilterChange("favorites")}
            className={`flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] tracking-wide font-medium transition-colors text-left ${
              activeFilter === "favorites"
                ? "bg-surface-hover text-foreground"
                : "text-muted hover:text-foreground hover:bg-surface-hover"
            }`}
          >
            <span>Favorites</span>
            <span
              className={`text-[10px] font-mono ${
                activeFilter === "favorites" ? "text-foreground" : "text-muted"
              }`}
            >
              0
            </span>
          </button>
        </nav>
      </div>

      {/* Tools / Agents section */}
      {agentsWithSkills.length > 0 && (
        <div className="px-3 pt-3 pb-2">
          <h3 className="text-[10px] uppercase tracking-widest font-semibold text-muted mb-2 px-2">
            Tools
          </h3>
          <nav className="flex flex-col gap-0.5">
            {agentsWithSkills.map((agent) => (
              <button
                key={agent.name}
                onClick={() => {
                  onFilterChange("all")
                  onSelectAgent(
                    selectedAgent === agent.displayName
                      ? null
                      : agent.displayName,
                  )
                }}
                className={`flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] tracking-wide font-medium transition-colors text-left ${
                  selectedAgent === agent.displayName
                    ? "bg-surface-hover text-foreground"
                    : dragOverTarget === `agent:${agent.displayName}`
                      ? "bg-surface-hover/70 ring-1 ring-accent text-foreground"
                    : "text-muted hover:text-foreground hover:bg-surface-hover"
                }`}
                onDragOver={(e) => {
                  if (!dragSkill) return
                  e.preventDefault()
                  onDragEnterTarget(`agent:${agent.displayName}`)
                }}
                onDragLeave={() => {
                  if (dragOverTarget === `agent:${agent.displayName}`) onDragEnterTarget(null)
                }}
                onDrop={(e) => {
                  if (!dragSkill) return
                  e.preventDefault()
                  onDropOnAgent(agent.displayName)
                }}
              >
                <span className="truncate">{agent.displayName}</span>
                <span
                  className={`text-[10px] font-mono ml-2 ${
                    selectedAgent === agent.displayName
                      ? "text-foreground"
                      : "text-muted"
                  }`}
                >
                  {agentSkillCounts[agent.displayName] || 0}
                </span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="text-[10px] uppercase tracking-widest font-semibold text-muted">
            Collections
          </h3>
          <button
            onClick={onCreateCollection}
            className="text-[11px] text-muted hover:text-foreground"
            title="Create collection"
          >
            +
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {Object.keys(collections).length === 0 ? (
            <p className="text-[11px] text-muted px-2 italic">None yet</p>
          ) : (
            Object.keys(collections)
              .sort()
              .map((name) => (
                <div key={name} className="group flex items-center gap-1">
                  <button
                    onClick={() => {
                      onFilterChange("all")
                      onSelectAgent(null)
                      onSelectCollection(selectedCollection === name ? null : name)
                    }}
                    className={`flex flex-1 items-center justify-between px-2 py-1.5 rounded-md text-[12px] tracking-wide font-medium transition-colors text-left ${
                      selectedCollection === name
                        ? "bg-surface-hover text-foreground"
                        : dragOverTarget === `collection:${name}`
                          ? "bg-surface-hover/70 ring-1 ring-accent shadow-[0_0_0_1px_rgba(255,255,255,0.06)] text-foreground scale-[1.01]"
                          : "text-muted hover:text-foreground hover:bg-surface-hover"
                    }`}
                    onDragOver={(e) => {
                      if (!dragSkill) return
                      e.preventDefault()
                      onDragEnterTarget(`collection:${name}`)
                    }}
                    onDragLeave={() => {
                      if (dragOverTarget === `collection:${name}`) onDragEnterTarget(null)
                    }}
                    onDrop={(e) => {
                      if (!dragSkill) return
                      e.preventDefault()
                      onDropOnCollection(name)
                    }}
                  >
                    <span className="truncate">{name}</span>
                    <span className="text-[10px] font-mono">{collectionCounts[name] || 0}</span>
                  </button>
                  <button
                    onClick={() => onRenameCollection(name)}
                    className="hidden group-hover:inline text-[10px] text-muted hover:text-foreground"
                    title="Rename collection"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDeleteCollection(name)}
                    className="hidden group-hover:inline text-[10px] text-muted hover:text-red-400"
                    title="Delete collection"
                  >
                    ×
                  </button>
                </div>
              ))
          )}
        </nav>
      </div>
      <div className="px-3 pt-3 pb-4 mt-auto">
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-muted mb-2 px-2">
          Servers
        </h3>
        <p className="text-[11px] text-muted px-2 italic">None configured</p>
      </div>
    </aside>
  )
}

// --------------------------------------------------------------------------
// Middle Skill List Panel
// --------------------------------------------------------------------------

interface MiddlePanelProps {
  loading: boolean
  skills: InstalledSkill[]
  filteredSkills: InstalledSkill[]
  searchQuery: string
  onSearchChange: (q: string) => void
  selectedSkillName: string | null
  onSelectSkill: (skill: InstalledSkill) => void
  selectedAgent: string | null
  selectedCollection: string | null
  onClearFilters: () => void
  onCreateSkill: () => void
  dragSkill: DragSkillPayload | null
  onDragSkillStart: (skill: InstalledSkill) => void
  onDragSkillEnd: () => void
}

function MiddlePanel({
  loading,
  skills,
  filteredSkills,
  searchQuery,
  onSearchChange,
  selectedSkillName,
  onSelectSkill,
  selectedAgent,
  selectedCollection,
  onClearFilters,
  onCreateSkill,
  dragSkill,
  onDragSkillStart,
  onDragSkillEnd,
}: MiddlePanelProps) {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col border-r border-border bg-background">
      {/* Search input */}
      <div className="p-3 border-b border-border">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-muted">Local Library</p>
          <button
            onClick={onCreateSkill}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-surface-hover"
          >
            New Skill
          </button>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
            <SearchIcon size={14} />
          </div>
          <input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded-md bg-surface border border-border text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-2.5 flex items-center text-muted hover:text-foreground transition-colors"
            >
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted">
        {loading
          ? "Scanning..."
          : `${filteredSkills.length} skill${filteredSkills.length !== 1 ? "s" : ""}${selectedAgent ? ` in ${selectedAgent}` : ""}${selectedCollection ? ` in ${selectedCollection}` : ""}`}
      </div>

      {/* Scrollable skill list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-[12px] text-muted animate-fade-in">
              Scanning for installed skills...
            </p>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            {skills.length === 0 ? (
              <>
                <SkillsGateIcon />
                <p className="text-muted text-[12px] mt-3">
                  No skills installed yet.
                </p>
                <p className="text-muted text-[11px] mt-1">
                  Head to Discover to find skills.
                </p>
              </>
            ) : (
              <>
                <p className="text-muted text-[12px]">
                  No skills match your search.
                </p>
                <button
                  onClick={onClearFilters}
                  className="text-accent text-[11px] mt-2 hover:text-foreground transition-colors"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredSkills.map((skill) => (
              <button
                key={skill.canonicalPath}
                onClick={() => onSelectSkill(skill)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move"
                  onDragSkillStart(skill)
                }}
                onDragEnd={() => onDragSkillEnd()}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-md text-left transition-colors ${
                  selectedSkillName === skill.name
                    ? "bg-surface-hover text-foreground"
                    : dragSkill?.canonicalPath === skill.canonicalPath
                      ? "opacity-60 ring-1 ring-accent/40"
                    : "text-muted hover:text-foreground hover:bg-surface-hover"
                }`}
              >
                <span className="text-[12px] font-medium truncate flex-1 min-w-0">
                  {skill.name}
                </span>
                <span className="ml-2 flex-shrink-0">
                  <AgentDots agents={skill.agents} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Inline SVG icons for the right panel
// --------------------------------------------------------------------------

function FolderIcon({ size = 14 }: { size?: number }) {
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
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

// --------------------------------------------------------------------------
// Remove Skill Dialog
// --------------------------------------------------------------------------

interface RemoveSkillDialogProps {
  skill: InstalledSkill
  onClose: () => void
  onRemoveFromAgents: (agentDisplayNames: string[]) => void
  onRemoveAll: () => void
}

function RemoveSkillDialog({ skill, onClose, onRemoveFromAgents, onRemoveAll }: RemoveSkillDialogProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const toggleAgent = (displayName: string) => {
    setChecked((prev) => ({ ...prev, [displayName]: !prev[displayName] }))
  }

  const selectedAgents = skill.agents.filter((a) => checked[a])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-sm mx-4 p-5 animate-slide-down">
        <h2 className="text-[14px] font-semibold text-foreground mb-1">
          Remove "{skill.name}"
        </h2>
        <p className="text-[12px] text-muted mb-4">
          This skill is installed in {skill.agents.length} agent{skill.agents.length !== 1 ? "s" : ""}:
        </p>

        <div className="flex flex-col gap-2 mb-5">
          {skill.agents.map((agent) => (
            <label
              key={agent}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!!checked[agent]}
                onChange={() => toggleAgent(agent)}
                className="rounded border-border accent-foreground"
              />
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getAgentColor(agent) }}
              />
              <span className="text-[12px] text-foreground">{agent}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-muted text-[12px] px-4 py-1.5 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedAgents.length > 0) onRemoveFromAgents(selectedAgents)
            }}
            disabled={selectedAgents.length === 0}
            className="text-[12px] px-4 py-1.5 rounded-lg border border-border text-foreground hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Remove selected
          </button>
          <button
            onClick={onRemoveAll}
            className="bg-red-600 text-white text-[12px] px-4 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
          >
            Remove all
          </button>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Right Detail Panel
// --------------------------------------------------------------------------

interface RightPanelProps {
  skill: InstalledSkill | null
  content: string | null
  contentLoading: boolean
  collections: Record<string, string[]>
  onContentSaved: (newContent: string) => void
  onSkillRemoved: () => void
  onToggleCollection: (collectionName: string, skill: InstalledSkill) => void
  onCreateCollection: () => void
}

function RightPanel({ skill, content, contentLoading, collections, onContentSaved, onSkillRemoved, onToggleCollection, onCreateCollection }: RightPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [supportingPreview, setSupportingPreview] = useState("")
  const [selectedSupportingFile, setSelectedSupportingFile] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)

  // Reset edit mode when skill changes
  useEffect(() => {
    setEditMode(false)
    setEditContent("")
    setSupportingPreview("")
    setSelectedSupportingFile(null)
    setSaveStatus("idle")
    setShowRemoveDialog(false)
  }, [skill?.name])

  useEffect(() => {
    if (!skill?.path || !skill.supportingFiles.length) {
      setSupportingPreview("")
      setSelectedSupportingFile(null)
      return
    }

    const firstFile = skill.supportingFiles[0]?.relativePath ?? null
    if (!firstFile) return

    let cancelled = false
    setSelectedSupportingFile(firstFile)
    electronAPI
      .readSupportingFile(skill.path, firstFile)
      .then((value) => {
        if (!cancelled) {
          setSupportingPreview(value)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupportingPreview("Preview unavailable.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [skill?.path, skill?.supportingFiles])

  const isLocalSkill = !!(skill?.path)

  const handleEditToggle = () => {
    if (!editMode && content) {
      setEditContent(content)
      setSaveStatus("idle")
    }
    setEditMode(!editMode)
  }

  const handleSave = async () => {
    if (!skill?.path) return
    setSaveStatus("saving")
    try {
      const filePath = skill.path + "/SKILL.md"
      await electronAPI.writeSkillContent(filePath, editContent)
      onContentSaved(editContent)
      setSaveStatus("saved")
      setTimeout(() => {
        setEditMode(false)
        setSaveStatus("idle")
      }, 800)
    } catch (err) {
      console.error("Failed to save skill content:", err)
      setSaveStatus("error")
    }
  }

  const handleCancel = () => {
    setEditContent("")
    setEditMode(false)
    setSaveStatus("idle")
  }

  const handleOpenInFinder = () => {
    if (!skill?.path) return
    electronAPI.openInFinder(skill.path + "/SKILL.md")
  }

  const handleSupportingFileSelect = async (relativePath: string) => {
    if (!skill?.path) return
    setSelectedSupportingFile(relativePath)
    try {
      const value = await electronAPI.readSupportingFile(skill.path, relativePath)
      setSupportingPreview(value)
    } catch (err) {
      console.error("Failed to read supporting file:", err)
      setSupportingPreview("Preview unavailable.")
    }
  }

  const handleDeleteClick = () => {
    if (!skill) return
    if (skill.agents.length > 1) {
      setShowRemoveDialog(true)
    } else {
      // Single agent: just confirm and remove all
      if (confirm(`Remove "${skill.name}" from ${skill.agents[0]}?`)) {
        electronAPI.removeSkill(skill.name).then(() => onSkillRemoved())
      }
    }
  }

  const handleRemoveFromAgents = async (agentDisplayNames: string[]) => {
    if (!skill) return
    for (const displayName of agentDisplayNames) {
      const registryKey = DISPLAY_NAME_TO_KEY[displayName] || displayName.toLowerCase().replace(/\s+/g, "-")
      await electronAPI.removeFromAgent(skill.name, registryKey)
    }
    setShowRemoveDialog(false)
    onSkillRemoved()
  }

  const handleRemoveAll = async () => {
    if (!skill) return
    await electronAPI.removeSkill(skill.name)
    setShowRemoveDialog(false)
    onSkillRemoved()
  }

  if (!skill) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <SkillsGateIcon />
          <p className="text-muted text-sm mt-3">
            Select a skill to view details
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">{skill.name}</h1>
                <SourceBadge sourceType={skill.sourceType} />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* View/Edit toggle */}
                {isLocalSkill && content && (
                  <div className="flex items-center rounded-lg border border-border bg-surface overflow-hidden text-[12px]">
                    <button
                      onClick={() => { if (editMode) handleCancel() }}
                      className={`px-3 py-1.5 transition-colors ${!editMode ? "bg-surface-hover text-foreground font-medium" : "text-muted hover:text-foreground"}`}
                    >
                      View
                    </button>
                    <button
                      onClick={() => { if (!editMode) handleEditToggle() }}
                      className={`px-3 py-1.5 transition-colors ${editMode ? "bg-surface-hover text-foreground font-medium" : "text-muted hover:text-foreground"}`}
                    >
                      Edit
                    </button>
                  </div>
                )}

                {/* Open in Finder */}
                {isLocalSkill && (
                  <button
                    onClick={handleOpenInFinder}
                    title="Show in Finder"
                    className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                  >
                    <FolderIcon />
                  </button>
                )}

                {/* Delete */}
                {isLocalSkill && (
                  <button
                    onClick={handleDeleteClick}
                    title="Remove skill"
                    className="p-1.5 rounded-md text-muted hover:text-red-500 hover:bg-surface-hover transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {skill.description && (
              <p className="text-sm text-muted mb-3">{skill.description}</p>
            )}
            <div className="flex items-center gap-1.5">
              <AgentDots agents={skill.agents} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
              <span className="rounded border border-border px-2 py-0.5">
                scope: {skill.scope}
              </span>
              {skill.projectName && (
                <span className="rounded border border-border px-2 py-0.5">
                  project: {skill.projectName}
                </span>
              )}
              <span className="rounded border border-border px-2 py-0.5">
                supporting files: {skill.supportingFiles.length}
              </span>
            </div>
            {skill.source && (
              <p className="text-[11px] text-muted font-mono mt-2">
                {skill.source}
              </p>
            )}
            <p className="text-[11px] text-muted font-mono mt-2 break-all">
              {skill.canonicalPath}
            </p>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-muted">Collections</p>
                <button
                  onClick={onCreateCollection}
                  className="text-[11px] text-muted hover:text-foreground"
                >
                  +
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(collections).length === 0 ? (
                  <span className="text-[11px] text-muted">No collections yet.</span>
                ) : (
                  Object.entries(collections).map(([name, items]) => {
                    const included = items.includes(skill.canonicalPath)
                    return (
                      <button
                        key={name}
                        onClick={() => onToggleCollection(name, skill)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                          included
                            ? "border-accent bg-surface-hover text-foreground"
                            : "border-border text-muted hover:text-foreground"
                        }`}
                      >
                        {name}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <hr className="border-border mb-6" />

          {/* Content: View or Edit mode */}
          {editMode ? (
            <div className="flex flex-col gap-3">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="bg-background border border-border rounded-lg font-mono text-[13px] p-4 w-full resize-none text-foreground focus:outline-none focus:border-accent transition-colors"
                style={{ minHeight: "400px" }}
                spellCheck={false}
              />
              <div className="flex items-center gap-2 justify-end">
                {saveStatus === "saved" && (
                  <span className="text-[12px] text-green-500 mr-2">Saved</span>
                )}
                {saveStatus === "error" && (
                  <span className="text-[12px] text-red-500 mr-2">Save failed</span>
                )}
                <button
                  onClick={handleCancel}
                  className="text-muted text-[12px] px-4 py-1.5 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  className="bg-foreground text-background text-[12px] px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saveStatus === "saving" ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : contentLoading ? (
            <p className="text-sm text-muted animate-fade-in">Loading content...</p>
          ) : content ? (
            <div
              className="skill-prose"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ) : (
            <p className="text-sm text-muted">
              Skill content not available. This skill may not have a SKILL.md file.
            </p>
          )}

          {skill.supportingFiles.length > 0 && !editMode && (
            <>
              <hr className="border-border my-6" />
              <div className="grid grid-cols-[220px_1fr] gap-4">
                <div>
                  <h2 className="text-[12px] uppercase tracking-widest text-muted mb-3">
                    Supporting Files
                  </h2>
                  <div className="flex flex-col gap-1">
                    {skill.supportingFiles.map((file) => (
                      <button
                        key={file.relativePath}
                        onClick={() => handleSupportingFileSelect(file.relativePath)}
                        className={`text-left rounded-md border px-2 py-1.5 text-[12px] transition-colors ${
                          selectedSupportingFile === file.relativePath
                            ? "border-accent bg-surface-hover text-foreground"
                            : "border-border text-muted hover:text-foreground hover:bg-surface-hover"
                        }`}
                      >
                        <div className="truncate">{file.relativePath}</div>
                        <div className="text-[10px] text-muted">{file.size} bytes</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-[12px] uppercase tracking-widest text-muted mb-3">
                    Preview
                  </h2>
                  <pre className="min-h-[220px] overflow-x-auto rounded-lg border border-border bg-surface p-4 text-[12px] text-foreground whitespace-pre-wrap">
                    {supportingPreview || "Select a supporting file to preview it."}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Remove skill dialog */}
      {showRemoveDialog && skill && (
        <RemoveSkillDialog
          skill={skill}
          onClose={() => setShowRemoveDialog(false)}
          onRemoveFromAgents={handleRemoveFromAgents}
          onRemoveAll={handleRemoveAll}
        />
      )}
    </div>
  )
}

function CreateSkillDialog({
  open,
  onClose,
  agents,
  defaultTargets,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  agents: DetectedAgent[]
  defaultTargets: string[]
  onCreate: (data: { name: string; description: string; content: string; targets: string[] }) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [targets, setTargets] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setName("")
      setDescription("")
      setContent("")
      setTargets(defaultTargets.length > 0 ? defaultTargets : agents.map((agent) => agent.name))
    }
  }, [open, defaultTargets, agents])

  if (!open) return null

  const toggleTarget = (name: string) => {
    setTargets((prev) => (prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h2 className="text-[15px] font-semibold text-foreground mb-1">New Skill</h2>
        <p className="text-[12px] text-muted mb-4">Create a local skill and install it into one or more targets.</p>
        <div className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Skill name"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
            className="min-h-[90px] w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`---
name: my-skill
description: What this skill does
---

# My Skill

## Instructions

Add your skill instructions here.`}
            className="min-h-[220px] w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground"
          />
          <div>
            <p className="text-[12px] font-medium text-foreground mb-2">Targets</p>
            <div className="grid grid-cols-2 gap-2">
              {agents.map((agent) => (
                <label key={agent.name} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[12px] text-foreground">
                  <input
                    type="checkbox"
                    checked={targets.includes(agent.name)}
                    onChange={() => toggleTarget(agent.name)}
                  />
                  <span>{agent.displayName}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[12px] text-muted">Cancel</button>
            <button
              onClick={() => onCreate({ name: name.trim(), description: description.trim(), content, targets })}
              disabled={!name.trim()}
              className="rounded-lg bg-foreground px-4 py-2 text-[12px] text-background disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CollectionDialog({
  open,
  mode,
  initialName,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: "create" | "rename"
  initialName: string
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(initialName)

  useEffect(() => {
    if (open) {
      setName(initialName)
    }
  }, [open, initialName])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h2 className="text-[15px] font-semibold text-foreground mb-1">
          {mode === "create" ? "New Collection" : "Rename Collection"}
        </h2>
        <p className="text-[12px] text-muted mb-4">
          {mode === "create"
            ? "Create a collection for grouping local skills."
            : "Choose a new name for this collection."}
        </p>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                onSubmit(name.trim())
              }
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[12px] text-muted">
              Cancel
            </button>
            <button
              onClick={() => onSubmit(name.trim())}
              disabled={!name.trim()}
              className="rounded-lg bg-foreground px-4 py-2 text-[12px] text-background disabled:opacity-40"
            >
              {mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Home (three-column layout)
// --------------------------------------------------------------------------

export function Home() {
  const [agents, setAgents] = useState<DetectedAgent[]>([])
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<"all" | "favorites">("all")
  const [selectedSkill, setSelectedSkill] = useState<InstalledSkill | null>(null)
  const [skillContent, setSkillContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [collections, setCollections] = useState<Record<string, string[]>>({})
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [defaultAgents, setDefaultAgents] = useState<string[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [dragSkill, setDragSkill] = useState<DragSkillPayload | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [dragToast, setDragToast] = useState<DragToast | null>(null)
  const [collectionDialog, setCollectionDialog] = useState<{
    open: boolean
    mode: "create" | "rename"
    initialName: string
    targetName: string | null
  }>({
    open: false,
    mode: "create",
    initialName: "",
    targetName: null,
  })

  // Load agents and skills on mount
  useEffect(() => {
    async function load() {
      try {
        const [detectedAgents, installedSkills] = await Promise.all([
          electronAPI.detectAgents(),
          electronAPI.listInstalled(),
        ])
        setAgents(detectedAgents)
        setSkills(installedSkills)
        const allSettings = await electronAPI.settingsAll()
        setCollections((allSettings["collections.skills"] as Record<string, string[]>) || {})
        setDefaultAgents((allSettings["install.defaultAgents"] as string[]) || [])
      } catch (err) {
        console.error("Failed to load installed skills:", err)
      } finally {
        setLoading(false)
      }
    }

    load()

    const cleanup = electronAPI.onSkillsUpdated((updatedSkills) => {
      setSkills(updatedSkills)
    })

    return cleanup
  }, [])

  // Load skill content when a skill is selected
  useEffect(() => {
    if (!selectedSkill) {
      setSkillContent(null)
      return
    }

    let cancelled = false
    setContentLoading(true)

    async function loadContent() {
      try {
        const raw = await electronAPI.readSkillContent(selectedSkill!.path)
        if (!cancelled) {
          setSkillContent(raw || null)
        }
      } catch (err) {
        console.error("Failed to load skill content:", err)
        if (!cancelled) {
          setSkillContent(null)
        }
      } finally {
        if (!cancelled) {
          setContentLoading(false)
        }
      }
    }

    loadContent()

    return () => {
      cancelled = true
    }
  }, [selectedSkill])

  // Count skills per agent
  const agentSkillCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const skill of skills) {
      for (const agentName of skill.agents) {
        counts[agentName] = (counts[agentName] || 0) + 1
      }
    }
    return counts
  }, [skills])

  // Filter skills by selected agent and search query
  const filteredSkills = useMemo(() => {
    let result = skills

    if (selectedCollection) {
      const ids = new Set(collections[selectedCollection] || [])
      result = result.filter((s) => ids.has(s.canonicalPath))
    }

    if (selectedAgent) {
      result = result.filter((s) => s.agents.includes(selectedAgent))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.source && s.source.toLowerCase().includes(q)) ||
          s.path.toLowerCase().includes(q) ||
          s.canonicalPath.toLowerCase().includes(q) ||
          (s.projectName && s.projectName.toLowerCase().includes(q)) ||
          s.supportingFiles.some((file) =>
            file.relativePath.toLowerCase().includes(q),
          ),
      )
    }

    return result
  }, [skills, selectedAgent, searchQuery, selectedCollection, collections])

  const collectionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [name, items] of Object.entries(collections)) {
      const ids = new Set(items)
      counts[name] = skills.filter((skill) => ids.has(skill.canonicalPath)).length
    }
    return counts
  }, [collections, skills])

  // Only show agents that actually have skills
  const agentsWithSkills = useMemo(() => {
    return agents.filter((a) => (agentSkillCounts[a.displayName] || 0) > 0)
  }, [agents, agentSkillCounts])

  const handleSelectSkill = useCallback((skill: InstalledSkill) => {
    setSelectedSkill(skill)
  }, [])

  const handleClearFilters = useCallback(() => {
    setSearchQuery("")
    setSelectedAgent(null)
    setSelectedCollection(null)
    setActiveFilter("all")
  }, [])

  const handleContentSaved = useCallback((newContent: string) => {
    setSkillContent(newContent)
  }, [])

  const handleSkillRemoved = useCallback(async () => {
    setSelectedSkill(null)
    setSkillContent(null)
    try {
      const installedSkills = await electronAPI.listInstalled()
      setSkills(installedSkills)
    } catch (err) {
      console.error("Failed to refresh skills after removal:", err)
    }
  }, [])

  const persistCollections = useCallback(async (next: Record<string, string[]>) => {
    setCollections(next)
    await electronAPI.settingsSet("collections.skills", next)
  }, [])

  const handleCreateCollection = useCallback(() => {
    setCollectionDialog({
      open: true,
      mode: "create",
      initialName: "",
      targetName: null,
    })
  }, [])

  const handleRenameCollection = useCallback((name: string) => {
    setCollectionDialog({
      open: true,
      mode: "rename",
      initialName: name,
      targetName: name,
    })
  }, [])

  const handleDeleteCollection = useCallback((name: string) => {
    if (!window.confirm(`Delete collection "${name}"?`)) return
    const next = { ...collections }
    delete next[name]
    if (selectedCollection === name) setSelectedCollection(null)
    void persistCollections(next)
  }, [collections, persistCollections, selectedCollection])

  const handleToggleCollection = useCallback((name: string, skill: InstalledSkill) => {
    const existing = new Set(collections[name] || [])
    if (existing.has(skill.canonicalPath)) {
      existing.delete(skill.canonicalPath)
    } else {
      existing.add(skill.canonicalPath)
    }
    void persistCollections({
      ...collections,
      [name]: Array.from(existing).sort(),
    })
  }, [collections, persistCollections])

  const handleDropOnCollection = useCallback((name: string) => {
    if (!dragSkill) return
    const next = { ...collections }
    const target = new Set(next[name] || [])
    target.add(dragSkill.canonicalPath)
    next[name] = Array.from(target).sort()
    if (selectedCollection && selectedCollection !== name) {
      const source = new Set(next[selectedCollection] || [])
      if (source.has(dragSkill.canonicalPath)) {
        source.delete(dragSkill.canonicalPath)
        next[selectedCollection] = Array.from(source).sort()
      }
    }
    void persistCollections(next)
    setDragToast({
      type: "success",
      message:
        selectedCollection && selectedCollection !== name
          ? `Moved "${dragSkill.name}" to ${name}`
          : `Added "${dragSkill.name}" to ${name}`,
    })
    setDragSkill(null)
    setDragOverTarget(null)
  }, [collections, dragSkill, persistCollections, selectedCollection])

  const handleDropOnAgent = useCallback(async (agentDisplayName: string) => {
    if (!dragSkill) return
    const registryKey =
      DISPLAY_NAME_TO_KEY[agentDisplayName] ||
      agentDisplayName.toLowerCase().replace(/\s+/g, "-")
    try {
      await electronAPI.addToAgent(dragSkill.name, dragSkill.canonicalPath, registryKey)
      const installedSkills = await electronAPI.listInstalled()
      setSkills(installedSkills)
      setDragToast({
        type: "success",
        message: `Added "${dragSkill.name}" to ${agentDisplayName}`,
      })
    } catch (err) {
      console.error("Failed to add skill to agent:", err)
      setDragToast({
        type: "error",
        message: `Failed to add "${dragSkill.name}" to ${agentDisplayName}`,
      })
    } finally {
      setDragSkill(null)
      setDragOverTarget(null)
    }
  }, [dragSkill])

  useEffect(() => {
    if (!dragToast) return
    const timer = window.setTimeout(() => setDragToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [dragToast])

  const handleCreateSkill = useCallback(async (data: { name: string; description: string; content: string; targets: string[] }) => {
    await electronAPI.createSkill({
      name: data.name,
      description: data.description,
      content: data.content,
      agentNames: data.targets,
    })
    setShowCreateDialog(false)
    const installedSkills = await electronAPI.listInstalled()
    setSkills(installedSkills)
  }, [])

  const handleCollectionDialogSubmit = useCallback((name: string) => {
    if (!name) return

    if (collectionDialog.mode === "create") {
      if (collections[name]) {
        setCollectionDialog((prev) => ({ ...prev, open: false }))
        return
      }
      void persistCollections({ ...collections, [name]: [] })
      setCollectionDialog((prev) => ({ ...prev, open: false }))
      return
    }

    const sourceName = collectionDialog.targetName
    if (!sourceName || sourceName === name) {
      setCollectionDialog((prev) => ({ ...prev, open: false }))
      return
    }

    const next = { ...collections }
    next[name] = next[sourceName] || []
    delete next[sourceName]
    if (selectedCollection === sourceName) setSelectedCollection(name)
    void persistCollections(next)
    setCollectionDialog((prev) => ({ ...prev, open: false }))
  }, [collectionDialog, collections, persistCollections, selectedCollection])

  return (
    <div className="flex h-full">
      {/* Column 1: Left sidebar (filter panel) */}
      <LeftSidebar
        totalSkillCount={skills.length}
        agentsWithSkills={agentsWithSkills}
        agentSkillCounts={agentSkillCounts}
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgent}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        collections={collections}
        collectionCounts={collectionCounts}
        selectedCollection={selectedCollection}
        onSelectCollection={setSelectedCollection}
        onCreateCollection={handleCreateCollection}
        onRenameCollection={handleRenameCollection}
        onDeleteCollection={handleDeleteCollection}
        dragSkill={dragSkill}
        dragOverTarget={dragOverTarget}
        onDragEnterTarget={setDragOverTarget}
        onDropOnAgent={handleDropOnAgent}
        onDropOnCollection={handleDropOnCollection}
      />

      {/* Column 2: Skill list */}
      <MiddlePanel
        loading={loading}
        skills={skills}
        filteredSkills={filteredSkills}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedSkillName={selectedSkill?.name ?? null}
        onSelectSkill={handleSelectSkill}
        selectedAgent={selectedAgent}
        selectedCollection={selectedCollection}
        onClearFilters={handleClearFilters}
        onCreateSkill={() => setShowCreateDialog(true)}
        dragSkill={dragSkill}
        onDragSkillStart={(skill) =>
          setDragSkill({ name: skill.name, canonicalPath: skill.canonicalPath })
        }
        onDragSkillEnd={() => {
          setDragSkill(null)
          setDragOverTarget(null)
        }}
      />

      {/* Column 3: Skill detail */}
      <RightPanel
        skill={selectedSkill}
        content={skillContent}
        contentLoading={contentLoading}
        collections={collections}
        onContentSaved={handleContentSaved}
        onSkillRemoved={handleSkillRemoved}
        onToggleCollection={handleToggleCollection}
        onCreateCollection={handleCreateCollection}
      />

      <CreateSkillDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        agents={agents}
        defaultTargets={defaultAgents}
        onCreate={handleCreateSkill}
      />

      <CollectionDialog
        open={collectionDialog.open}
        mode={collectionDialog.mode}
        initialName={collectionDialog.initialName}
        onClose={() =>
          setCollectionDialog((prev) => ({ ...prev, open: false }))
        }
        onSubmit={handleCollectionDialogSubmit}
      />

      {dragSkill && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 rounded-full border border-accent/40 bg-surface px-4 py-2 text-[12px] text-foreground shadow-lg">
          Dragging “{dragSkill.name}”
        </div>
      )}

      {dragToast && (
        <div
          className={`pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border px-4 py-2 text-[12px] shadow-lg ${
            dragToast.type === "success"
              ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-100"
              : "border-red-500/30 bg-red-950/80 text-red-100"
          }`}
        >
          {dragToast.message}
        </div>
      )}
    </div>
  )
}
