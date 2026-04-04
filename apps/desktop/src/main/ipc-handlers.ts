import { ipcMain, shell, type BrowserWindow } from "electron"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { execFile } from "node:child_process"
import matter from "gray-matter"
import { app } from "electron"
import { openDb } from "./db/index"
import { SettingsStore } from "./db/settings"
import { RemoteServerStore } from "./db/servers"
import { RemoteSkillStore } from "./db/skills"
import { loadCachedSkills, saveCachedSkills } from "./db/skills-cache"
import { testConnection, syncRemoteServer, readRemoteFile, writeRemoteFile } from "./db/ssh"
import { checkForAppUpdates, getUpdateState, quitAndInstallUpdate } from "./auto-updater"

// ---------------------------------------------------------------------------
// Agent registry (mirrored from packages/cli/src/core/agents.ts)
//
// We duplicate the agent config here rather than importing from packages/cli
// directly because the CLI uses ESM with .js extensions in imports, which
// complicates bundling. The agent list is small and stable, so maintaining
// a mirror is acceptable. A shared config package can be extracted later.
// ---------------------------------------------------------------------------

const home = os.homedir()
const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
const factoryHome = process.env.FACTORY_HOME || path.join(home, ".factory")

interface AgentEntry {
  name: string
  displayName: string
  shortCode: string
  globalSkillsDir: string
  detectInstalled: () => Promise<boolean>
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p)
    return stat.isFile()
  } catch {
    return false
  }
}

const agentRegistry: Record<string, AgentEntry> = {
  "claude-code": {
    name: "claude-code",
    displayName: "Claude Code",
    shortCode: "CC",
    globalSkillsDir: path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"),
      "skills",
    ),
    detectInstalled: () =>
      dirExists(process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude")),
  },
  cursor: {
    name: "cursor",
    displayName: "Cursor",
    shortCode: "CU",
    globalSkillsDir: path.join(home, ".cursor", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".cursor")),
  },
  "github-copilot": {
    name: "github-copilot",
    displayName: "GitHub Copilot",
    shortCode: "GC",
    globalSkillsDir: path.join(configHome, "github-copilot", "skills"),
    detectInstalled: () => dirExists(path.join(configHome, "github-copilot")),
  },
  windsurf: {
    name: "windsurf",
    displayName: "Windsurf",
    shortCode: "WS",
    globalSkillsDir: path.join(home, ".windsurf", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".windsurf")),
  },
  cline: {
    name: "cline",
    displayName: "Cline",
    shortCode: "CL",
    globalSkillsDir: path.join(home, ".cline", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".cline")),
  },
  continue: {
    name: "continue",
    displayName: "Continue",
    shortCode: "CN",
    globalSkillsDir: path.join(home, ".continue", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".continue")),
  },
  "codex-cli": {
    name: "codex-cli",
    displayName: "Codex CLI",
    shortCode: "CX",
    globalSkillsDir: path.join(
      process.env.CODEX_HOME || path.join(home, ".codex"),
      "skills",
    ),
    detectInstalled: () =>
      dirExists(process.env.CODEX_HOME || path.join(home, ".codex")),
  },
  "droid-cli": {
    name: "droid-cli",
    displayName: "Droid CLI",
    shortCode: "DR",
    globalSkillsDir: path.join(factoryHome, "skills"),
    detectInstalled: () => dirExists(factoryHome),
  },
  amp: {
    name: "amp",
    displayName: "Amp",
    shortCode: "AM",
    globalSkillsDir: path.join(home, ".amp", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".amp")),
  },
  goose: {
    name: "goose",
    displayName: "Goose",
    shortCode: "GO",
    globalSkillsDir: path.join(home, ".goose", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".goose")),
  },
  junie: {
    name: "junie",
    displayName: "Junie",
    shortCode: "JU",
    globalSkillsDir: path.join(home, ".junie", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".junie")),
  },
  "kilo-code": {
    name: "kilo-code",
    displayName: "Kilo Code",
    shortCode: "KC",
    globalSkillsDir: path.join(home, ".kilo-code", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".kilo-code")),
  },
  opencode: {
    name: "opencode",
    displayName: "OpenCode",
    shortCode: "OC",
    globalSkillsDir: path.join(home, ".opencode", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".opencode")),
  },
  openclaw: {
    name: "openclaw",
    displayName: "OpenClaw",
    shortCode: "OW",
    globalSkillsDir: path.join(home, ".openclaw", "skills"),
    detectInstalled: async () =>
      (await dirExists(path.join(home, ".openclaw"))) ||
      (await dirExists(path.join(home, ".clawdbot"))) ||
      (await dirExists(path.join(home, ".moltbot"))),
  },
  "pear-ai": {
    name: "pear-ai",
    displayName: "Pear AI",
    shortCode: "PA",
    globalSkillsDir: path.join(home, ".pear-ai", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".pear-ai")),
  },
  "roo-code": {
    name: "roo-code",
    displayName: "Roo Code",
    shortCode: "RC",
    globalSkillsDir: path.join(home, ".roo-code", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".roo-code")),
  },
  trae: {
    name: "trae",
    displayName: "Trae",
    shortCode: "TR",
    globalSkillsDir: path.join(home, ".trae", "skills"),
    detectInstalled: () => dirExists(path.join(home, ".trae")),
  },
  zed: {
    name: "zed",
    displayName: "Zed",
    shortCode: "ZD",
    globalSkillsDir: path.join(configHome, "zed", "skills"),
    detectInstalled: () => dirExists(path.join(configHome, "zed")),
  },
  universal: {
    name: "universal",
    displayName: "Universal (.agents/skills)",
    shortCode: "UA",
    globalSkillsDir: path.join(home, ".agents", "skills"),
    detectInstalled: async () => true,
  },
}

// ---------------------------------------------------------------------------
// Lock file reading (mirrored from packages/cli/src/core/skill-lock.ts)
// ---------------------------------------------------------------------------

const LOCK_FILE_VERSION = 1
const LOCK_FILE_PATH = path.join(home, ".agents", ".skill-lock.json")
const CANONICAL_SKILLS_DIR = path.join(home, ".agents", "skills")

interface SkillLockEntry {
  source: string
  sourceType: string
  originalUrl: string
  skillFolderHash: string
  installedAt: string
  updatedAt: string
}

interface SkillLockFile {
  version: number
  skills: Record<string, SkillLockEntry>
}

async function readSkillLock(): Promise<SkillLockFile> {
  try {
    const raw = await fs.readFile(LOCK_FILE_PATH, "utf-8")
    const data = JSON.parse(raw) as SkillLockFile
    if (data.version !== LOCK_FILE_VERSION) {
      return { version: LOCK_FILE_VERSION, skills: {} }
    }
    return data
  } catch {
    return { version: LOCK_FILE_VERSION, skills: {} }
  }
}

async function writeSkillLock(lock: SkillLockFile): Promise<void> {
  await fs.mkdir(path.dirname(LOCK_FILE_PATH), { recursive: true })
  await fs.writeFile(LOCK_FILE_PATH, JSON.stringify(lock, null, 2), "utf-8")
}

// ---------------------------------------------------------------------------
// Auth (mirrors packages/cli/src/utils/auth-store.ts and constants.ts)
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.SKILLSGATE_API_URL ?? "https://skillsgate.ai"
const AUTH_DIR = path.join(home, ".skillsgate")
const AUTH_FILE_PATH = path.join(home, ".skillsgate", "auth.json")

interface StoredAuth {
  token: string
  user: {
    id: string
    name: string
    email: string
    image?: string
  }
}

interface ExchangeResponse {
  access_token: string
  user: { id: string; name: string; email: string; image?: string }
}

// Auth stored in shared SQLite (syncs with TUI)
const AUTH_TOKEN_KEY = "auth.token"
const AUTH_USER_KEY = "auth.user"

function loadAuth(): StoredAuth | null {
  try {
    const token = settingsStore?.get<string | null>(AUTH_TOKEN_KEY, null)
    const user = settingsStore?.get<StoredAuth["user"] | null>(AUTH_USER_KEY, null)
    if (token && user) return { token, user }

    // Fallback: try legacy file-based auth and migrate
    try {
      const raw = require("fs").readFileSync(AUTH_FILE_PATH, "utf-8")
      const data = JSON.parse(raw) as StoredAuth
      if (data.user && data.token) {
        // Migrate to SQLite
        settingsStore?.set(AUTH_TOKEN_KEY, data.token)
        settingsStore?.set(AUTH_USER_KEY, data.user)
        return data
      }
    } catch {}

    return null
  } catch {
    return null
  }
}

function saveAuthToDb(data: StoredAuth): void {
  settingsStore?.set(AUTH_TOKEN_KEY, data.token)
  settingsStore?.set(AUTH_USER_KEY, data.user)
  // Also write legacy file for CLI compatibility
  require("fs").mkdirSync(AUTH_DIR, { recursive: true })
  require("fs").writeFileSync(AUTH_FILE_PATH, JSON.stringify(data, null, 2), "utf-8")
}

function clearAuthFromDb(): void {
  settingsStore?.set(AUTH_TOKEN_KEY, null)
  settingsStore?.set(AUTH_USER_KEY, null)
  try { require("fs").unlinkSync(AUTH_FILE_PATH) } catch {}
}

// ---------------------------------------------------------------------------
// SKILL.md parsing
// ---------------------------------------------------------------------------

interface ParsedSkill {
  name: string
  description: string
  filePath: string
}

interface SupportingFile {
  relativePath: string
  size: number
}

const CUSTOM_SCAN_PATHS_KEY = "scan.customPaths"
const DEFAULT_AGENTS_KEY = "install.defaultAgents"
const MIRROR_AGENTS_KEY = "sync.mirrorAgents"

const PROJECT_PROBES = [
  { subpath: ".claude/skills" },
  { subpath: ".cursor/skills" },
  { subpath: ".cursor/rules" },
  { subpath: ".codex/skills" },
  { subpath: ".github/skills" },
  { subpath: ".windsurf/skills" },
  { subpath: ".continue/skills" },
  { subpath: ".cline/skills" },
  { subpath: ".amp/skills" },
  { subpath: ".opencode/skills" },
  { subpath: ".goose/skills" },
  { subpath: ".junie/skills" },
  { subpath: ".kilo-code/skills" },
  { subpath: ".pear-ai/skills" },
  { subpath: ".roo-code/skills" },
  { subpath: ".trae/skills" },
  { subpath: ".zed/skills" },
  { subpath: ".agents/skills" },
]

async function parseSkillMd(filePath: string): Promise<ParsedSkill | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const { data: frontmatter } = matter(raw)

    if (
      typeof frontmatter.name !== "string" ||
      typeof frontmatter.description !== "string"
    ) {
      return null
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      filePath,
    }
  } catch {
    return null
  }
}

function getScopeForPath(resolvedPath: string): "global" | "project" | "custom" {
  const globalRoots = [
    CANONICAL_SKILLS_DIR,
    ...Object.values(agentRegistry).map((agent) => agent.globalSkillsDir),
  ].map((root) => path.resolve(root))

  if (globalRoots.some((root) => resolvedPath.startsWith(root))) {
    return "global"
  }

  if (resolvedPath.split(path.sep).some((segment) => segment.startsWith("."))) {
    return "project"
  }

  return "custom"
}

function getProjectNameForPath(resolvedPath: string): string | null {
  const parts = path.resolve(resolvedPath).split(path.sep).filter(Boolean)
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith(".")) {
      return parts[i - 1] || null
    }
  }
  return null
}

async function listSupportingFiles(skillDir: string): Promise<SupportingFile[]> {
  const files: SupportingFile[] = []

  async function walk(currentDir: string, prefix = ""): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      const relativePath = prefix ? path.join(prefix, entry.name) : entry.name

      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath)
        continue
      }

      if (!entry.isFile() || relativePath === "SKILL.md") continue

      const stat = await fs.stat(absolutePath)
      files.push({
        relativePath: relativePath.split(path.sep).join("/"),
        size: stat.size,
      })
    }
  }

  try {
    await walk(skillDir)
  } catch {
    return []
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function isSkillPathAllowed(resolvedPath: string): boolean {
  return (
    Object.values(agentRegistry).some((agent) =>
      resolvedPath.startsWith(path.resolve(agent.globalSkillsDir)),
    ) || resolvedPath.startsWith(path.resolve(CANONICAL_SKILLS_DIR))
  )
}

function getExpandedTargetAgents(requestedAgentNames: string[]): AgentEntry[] {
  const configuredDefaultAgents = settingsStore?.get<string[]>(DEFAULT_AGENTS_KEY, []) ?? []
  const configuredMirrorAgents = settingsStore?.get<string[]>(MIRROR_AGENTS_KEY, []) ?? []

  const baseNames =
    requestedAgentNames.length > 0
      ? requestedAgentNames
      : configuredDefaultAgents.length > 0
        ? configuredDefaultAgents
        : []

  const resolvedBaseNames = baseNames.length > 0 ? baseNames : Object.keys(agentRegistry)
  const finalNames = Array.from(
    new Set([...resolvedBaseNames, ...configuredMirrorAgents]),
  )

  return finalNames
    .map((name) => agentRegistry[name])
    .filter((value): value is AgentEntry => Boolean(value))
}

async function collectSkillsFromRoot(
  rootPath: string,
  scopeHint: "custom" | "project",
): Promise<
  Array<{
    name: string
    description: string
    path: string
    canonicalPath: string
    agents: string[]
    agentShortCodes: string[]
    scope: "global" | "project" | "custom"
    projectName: string | null
    hasSupportingFiles: boolean
    supportingFiles: SupportingFile[]
    source?: string
    sourceType?: string
    installedAt?: string
    updatedAt?: string
    folderName: string
  }>
> {
  const results: Array<{
    name: string
    description: string
    path: string
    canonicalPath: string
    agents: string[]
    agentShortCodes: string[]
    scope: "global" | "project" | "custom"
    projectName: string | null
    hasSupportingFiles: boolean
    supportingFiles: SupportingFile[]
    source?: string
    sourceType?: string
    installedAt?: string
    updatedAt?: string
    folderName: string
  }> = []

  const resolvedRoot = path.resolve(rootPath.replace(/^~(?=$|\/|\\)/, home))
  const lock = await readSkillLock()

  async function maybeCollectSkillDir(skillDir: string, scope: "project" | "custom") {
    const skillMdPath = path.join(skillDir, "SKILL.md")
    if (!(await fileExists(skillMdPath))) return

    const canonicalPath = await fs.realpath(skillDir).catch(() => skillDir)
    const parsed = await parseSkillMd(skillMdPath)
    const folderName = path.basename(skillDir)
    const lockEntry = lock.skills[folderName]
    const supportingFiles = await listSupportingFiles(canonicalPath)

    results.push({
      name: parsed?.name || folderName,
      description: parsed?.description || "",
      path: skillDir,
      canonicalPath,
      agents: [],
      agentShortCodes: [],
      scope,
      projectName: scope === "project" ? getProjectNameForPath(skillDir) : null,
      hasSupportingFiles: supportingFiles.length > 0,
      supportingFiles,
      source: lockEntry?.source,
      sourceType: lockEntry?.sourceType,
      installedAt: lockEntry?.installedAt,
      updatedAt: lockEntry?.updatedAt,
      folderName,
    })
  }

  await maybeCollectSkillDir(resolvedRoot, scopeHint)

  let rootEntries: Awaited<ReturnType<typeof fs.readdir>> = []
  try {
    rootEntries = await fs.readdir(resolvedRoot, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue
    const full = path.join(resolvedRoot, entry.name)
    await maybeCollectSkillDir(full, scopeHint)
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue
    const projectRoot = path.join(resolvedRoot, entry.name)
    for (const probe of PROJECT_PROBES) {
      const probeDir = path.join(projectRoot, probe.subpath)
      let entries: Awaited<ReturnType<typeof fs.readdir>> = []
      try {
        entries = await fs.readdir(probeDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const skillEntry of entries) {
        if (!skillEntry.isDirectory()) continue
        await maybeCollectSkillDir(path.join(probeDir, skillEntry.name), "project")
      }
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Detect all installed agents on this machine */
async function detectAgents(): Promise<
  Array<{ name: string; displayName: string; shortCode: string }>
> {
  const detected: Array<{
    name: string
    displayName: string
    shortCode: string
  }> = []
  for (const agent of Object.values(agentRegistry)) {
    try {
      if (await agent.detectInstalled()) {
        detected.push({
          name: agent.name,
          displayName: agent.displayName,
          shortCode: agent.shortCode,
        })
      }
    } catch {
      // Skip agents that fail detection
    }
  }
  return detected
}

/** Scan all detected agents for installed skills, merging with lock file data.
 *  Returns the full internal shape including folderName (needed for caching). */
async function listInstalledSkillsInternal(): Promise<
  Array<{
    name: string
    description: string
    path: string
    canonicalPath: string
    agents: string[]
    agentShortCodes: string[]
    scope: "global" | "project" | "custom"
    projectName: string | null
    hasSupportingFiles: boolean
    supportingFiles: SupportingFile[]
    source?: string
    sourceType?: string
    installedAt?: string
    updatedAt?: string
    folderName: string
  }>
> {
  const lock = await readSkillLock()
  const skillMap = new Map<
    string,
    {
      name: string
      description: string
      path: string
      canonicalPath: string
      agents: string[]
      agentShortCodes: string[]
      scope: "global" | "project" | "custom"
      projectName: string | null
      hasSupportingFiles: boolean
      supportingFiles: SupportingFile[]
      source?: string
      sourceType?: string
      installedAt?: string
      updatedAt?: string
      folderName: string
    }
  >()

  for (const agent of Object.values(agentRegistry)) {
    const skillsDir = agent.globalSkillsDir
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

        // For symlinks, resolve the actual path to read SKILL.md
        let skillDir = path.join(skillsDir, entry.name)
        try {
          const realPath = await fs.realpath(skillDir)
          // Check if the resolved path still exists
          await fs.stat(realPath)
          skillDir = realPath
        } catch {
          // Broken symlink or unresolvable - skip
          continue
        }

        const skillMdPath = path.join(skillDir, "SKILL.md")
        const parsed = await parseSkillMd(skillMdPath)
        const supportingFiles = await listSupportingFiles(skillDir)
        const scope = getScopeForPath(skillDir)
        const projectName =
          scope === "project" ? getProjectNameForPath(skillDir) : null

        const skillName = parsed?.name || entry.name
        const existing = skillMap.get(skillDir)

        if (existing) {
          if (!existing.agents.includes(agent.displayName)) {
            existing.agents.push(agent.displayName)
            existing.agentShortCodes.push(agent.shortCode)
          }
        } else {
          const lockEntry = lock.skills[entry.name]
          skillMap.set(skillDir, {
            name: skillName,
            description: parsed?.description || "",
            path: skillDir,
            canonicalPath: skillDir,
            agents: [agent.displayName],
            agentShortCodes: [agent.shortCode],
            scope,
            projectName,
            hasSupportingFiles: supportingFiles.length > 0,
            supportingFiles,
            source: lockEntry?.source,
            sourceType: lockEntry?.sourceType,
            installedAt: lockEntry?.installedAt,
            updatedAt: lockEntry?.updatedAt,
            folderName: entry.name,
          })
        }
      }
    } catch {
      // Directory does not exist or is not readable
    }
  }

  const customScanPaths = settingsStore?.get<string[]>(CUSTOM_SCAN_PATHS_KEY, []) ?? []
  for (const customPath of customScanPaths) {
    const collected = await collectSkillsFromRoot(customPath, "custom")
    for (const item of collected) {
      if (!skillMap.has(item.canonicalPath)) {
        skillMap.set(item.canonicalPath, item)
      }
    }
  }

  return Array.from(skillMap.values())
}

/** Internal skill type that includes folderName for cache storage. */
type InternalSkill = Awaited<ReturnType<typeof listInstalledSkillsInternal>>[number]

/** Strip the internal folderName field before sending to the renderer. */
function toRendererSkills(skills: InternalSkill[]) {
  return skills.map(
    ({ folderName: _, ...rest }) => rest,
  ) as Array<Omit<InternalSkill, "folderName">>
}

/** Backward-compatible wrapper -- returns the renderer-safe shape. */
async function listInstalledSkills() {
  const raw = await listInstalledSkillsInternal()
  return toRendererSkills(raw)
}

// ---------------------------------------------------------------------------
// Skills cache: rescan, save, and push to renderer
// ---------------------------------------------------------------------------

let _mainWindow: BrowserWindow | null = null

/** Called from the main process to provide a window reference for pushing events. */
export function setMainWindow(win: BrowserWindow): void {
  _mainWindow = win
}

/**
 * Run a full filesystem scan, persist results to the SQLite cache,
 * and push the updated list to the renderer via the skills:updated event.
 *
 * Safe to call from anywhere (file watcher, IPC handler, etc.).
 */
async function rescanAndCache() {
  const raw = await listInstalledSkillsInternal()
  saveCachedSkills(raw)

  const skills = toRendererSkills(raw)

  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send("skills:updated", skills)
  }

  return skills
}

// ---------------------------------------------------------------------------
// Git clone helper (uses system git to avoid simple-git dependency)
// ---------------------------------------------------------------------------

function gitClone(
  url: string,
  dest: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["clone", "--depth", "1", url, dest],
      { timeout: 60_000 },
      (error) => {
        if (error) {
          resolve({ success: false, error: error.message })
        } else {
          resolve({ success: true })
        }
      },
    )
  })
}

// ---------------------------------------------------------------------------
// Source parser (mirrored from packages/cli/src/core/source-parser.ts)
// ---------------------------------------------------------------------------

interface ParsedSource {
  type: "github" | "local"
  owner: string
  repo: string
  url: string
  subpath?: string
  ref?: string
}

function parseSource(source: string): ParsedSource | null {
  // GitHub URL
  if (
    source.startsWith("https://github.com/") ||
    source.startsWith("github.com/")
  ) {
    let url = source
    if (url.startsWith("github.com/")) url = `https://${url}`
    try {
      const parsed = new URL(url)
      const parts = parsed.pathname.split("/").filter(Boolean)
      if (parts.length < 2) return null
      return {
        type: "github",
        owner: parts[0],
        repo: parts[1],
        url: `https://github.com/${parts[0]}/${parts[1]}`,
      }
    } catch {
      return null
    }
  }

  // owner/repo shorthand
  const match = source.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)$/)
  if (match) {
    return {
      type: "github",
      owner: match[1],
      repo: match[2],
      url: `https://github.com/${match[1]}/${match[2]}`,
    }
  }

  // Local path
  if (
    source.startsWith("./") ||
    source.startsWith("../") ||
    source.startsWith("/") ||
    source.startsWith("~/")
  ) {
    let resolved = source
    if (resolved.startsWith("~/")) {
      resolved = path.join(home, resolved.slice(2))
    }
    resolved = path.resolve(resolved)
    return {
      type: "local",
      owner: "",
      repo: path.basename(resolved),
      url: resolved,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Skill discovery in a directory tree
// ---------------------------------------------------------------------------

const SKILL_MD = "SKILL.md"
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "__pycache__"])

async function discoverSkillsInDir(
  dir: string,
  depth = 0,
  maxDepth = 5,
): Promise<ParsedSkill[]> {
  if (depth > maxDepth) return []

  const skills: ParsedSkill[] = []

  // Check if this directory has a SKILL.md
  const skillMdPath = path.join(dir, SKILL_MD)
  if (await fileExists(skillMdPath)) {
    const parsed = await parseSkillMd(skillMdPath)
    if (parsed) skills.push(parsed)
    // If at root and found a skill, don't recurse further
    if (depth === 0 && skills.length > 0) return skills
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP_DIRS.has(entry.name)) continue
      if (entry.name.startsWith(".") && depth > 0) continue

      const subSkills = await discoverSkillsInDir(
        path.join(dir, entry.name),
        depth + 1,
        maxDepth,
      )
      skills.push(...subSkills)
    }
  } catch {
    // Directory not readable
  }

  return skills
}

// ---------------------------------------------------------------------------
// Install skill files to an agent directory (symlink with copy fallback)
// ---------------------------------------------------------------------------

async function installSkillToAgent(
  skillDir: string,
  skillName: string,
  agent: AgentEntry,
): Promise<{ success: boolean; error?: string }> {
  const safeName = sanitizeName(skillName)
  const agentTargetDir = path.join(agent.globalSkillsDir, safeName)
  const canonicalDir = path.join(CANONICAL_SKILLS_DIR, safeName)

  try {
    // Ensure agent skills directory exists
    await fs.mkdir(agent.globalSkillsDir, { recursive: true })

    // If the agent IS the universal agent, the canonical dir IS the target
    if (path.resolve(agentTargetDir) === path.resolve(canonicalDir)) {
      // Copy skill files directly to the canonical dir
      await fs.rm(canonicalDir, { recursive: true, force: true }).catch(() => {})
      await fs.cp(skillDir, canonicalDir, { recursive: true })
      return { success: true }
    }

    // Ensure canonical dir has the skill
    if (!(await dirExists(canonicalDir))) {
      await fs.cp(skillDir, canonicalDir, { recursive: true })
    }

    // Try symlink from agent dir to canonical dir
    try {
      // Remove existing target
      try {
        const stat = await fs.lstat(agentTargetDir)
        if (stat.isSymbolicLink()) {
          await fs.unlink(agentTargetDir)
        } else {
          await fs.rm(agentTargetDir, { recursive: true, force: true })
        }
      } catch {
        // Target doesn't exist, that's fine
      }

      const relativePath = path.relative(
        path.dirname(agentTargetDir),
        canonicalDir,
      )
      const type = process.platform === "win32" ? "junction" : undefined
      await fs.symlink(relativePath, agentTargetDir, type)
      return { success: true }
    } catch {
      // Symlink failed, fall back to copy
      await fs.rm(agentTargetDir, { recursive: true, force: true }).catch(
        () => {},
      )
      await fs.cp(skillDir, agentTargetDir, { recursive: true })
      return { success: true }
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

// Initialize SQLite stores (lazy, created on first registerIpcHandlers call)
let settingsStore: SettingsStore
let serverStore: RemoteServerStore
let skillStore: RemoteSkillStore

export function registerIpcHandlers(): void {
  // Open shared SQLite database
  const db = openDb()
  settingsStore = new SettingsStore(db)
  serverStore = new RemoteServerStore(db)
  skillStore = new RemoteSkillStore(db)
  // Detect which agents are installed on this machine
  ipcMain.handle("agents:detect", async () => {
    return detectAgents()
  })

  // List all installed skills across all detected agents.
  // Returns cached data instantly when available, then rescans in the
  // background and pushes a skills:updated event when the fresh data is ready.
  ipcMain.handle("skills:list-installed", async () => {
    const cached = loadCachedSkills()
    if (cached.length > 0) {
      // Return stale-while-revalidate: send cached data now, rescan later
      rescanAndCache().catch((err) => {
        console.error("Background rescan failed:", err)
      })
      return toRendererSkills(cached)
    }
    // Cache is empty (first launch or cleared) -- do a full scan synchronously
    return rescanAndCache()
  })

  // Force a full filesystem rescan, update the cache, and push to renderer
  ipcMain.handle("skills:rescan", async () => {
    return rescanAndCache()
  })

  // Read the content of a skill's SKILL.md file
  ipcMain.handle("skill:read-content", async (_event, skillPath: string) => {
    // Validate the path is within allowed skill directories
    const resolved = path.resolve(skillPath)
    if (!isSkillPathAllowed(resolved)) {
      throw new Error("Access denied: path is outside skill directories")
    }

    const skillMdPath = path.join(resolved, "SKILL.md")
    try {
      return await fs.readFile(skillMdPath, "utf-8")
    } catch {
      // If skillPath itself is a SKILL.md file, try reading it directly
      if (resolved.endsWith("SKILL.md")) {
        try {
          return await fs.readFile(resolved, "utf-8")
        } catch {
          return ""
        }
      }
      return ""
    }
  })

  ipcMain.handle("skill:list-supporting-files", async (_event, skillPath: string) => {
    const resolved = path.resolve(skillPath)
    if (!isSkillPathAllowed(resolved)) {
      throw new Error("Access denied: path is outside skill directories")
    }
    return listSupportingFiles(resolved)
  })

  ipcMain.handle(
    "skill:read-supporting-file",
    async (_event, skillPath: string, relativePath: string) => {
      const resolved = path.resolve(skillPath)
      if (!isSkillPathAllowed(resolved)) {
        throw new Error("Access denied: path is outside skill directories")
      }
      const filePath = path.resolve(resolved, relativePath)
      if (!filePath.startsWith(resolved)) {
        throw new Error("Access denied: invalid supporting file path")
      }
      return fs.readFile(filePath, "utf-8")
    },
  )

  // Install a skill from a source (GitHub owner/repo, URL, or local path)
  ipcMain.handle(
    "skills:install",
    async (
      _event,
      source: string,
      agentNames: string[],
      _scope: string,
    ): Promise<
      Array<{ skillName: string; agent: string; success: boolean; error?: string }>
    > => {
      const parsed = parseSource(source)
      if (!parsed) {
        return [
          {
            skillName: source,
            agent: "unknown",
            success: false,
            error: `Could not parse source: "${source}". Expected owner/repo, GitHub URL, or local path.`,
          },
        ]
      }

      let sourceDir: string
      let tmpDir: string | null = null

      if (parsed.type === "github") {
        // Clone repository to temp directory
        tmpDir = path.join(os.tmpdir(), `skillsgate-${Date.now()}`)
        const cloneResult = await gitClone(`${parsed.url}.git`, tmpDir)
        if (!cloneResult.success) {
          return [
            {
              skillName: source,
              agent: "unknown",
              success: false,
              error: `Clone failed: ${cloneResult.error}`,
            },
          ]
        }
        sourceDir = tmpDir
      } else {
        sourceDir = parsed.url
      }

      // Discover skills in the source
      const discovered = await discoverSkillsInDir(sourceDir)
      if (discovered.length === 0) {
        // Cleanup temp dir
        if (tmpDir) {
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
        }
        return [
          {
            skillName: source,
            agent: "unknown",
            success: false,
            error: "No SKILL.md files found in source.",
          },
        ]
      }

      // Determine target agents
      const detected = await detectAgents()
      const detectedNames = new Set(detected.map((agent) => agent.name))
      const targetAgents = getExpandedTargetAgents(agentNames).filter((agent) =>
        detectedNames.has(agent.name),
      )

      const results: Array<{
        skillName: string
        agent: string
        success: boolean
        error?: string
      }> = []

      const lock = await readSkillLock()
      const now = new Date().toISOString()

      for (const skill of discovered) {
        const skillDir = path.dirname(skill.filePath)

        for (const agent of targetAgents) {
          const result = await installSkillToAgent(skillDir, skill.name, agent)
          results.push({
            skillName: skill.name,
            agent: agent.displayName,
            success: result.success,
            error: result.error,
          })
        }

        // Update lock file
        const safeName = sanitizeName(skill.name)
        const existing = lock.skills[safeName]
        lock.skills[safeName] = {
          source:
            parsed.type === "github"
              ? `${parsed.owner}/${parsed.repo}`
              : parsed.url,
          sourceType: parsed.type,
          originalUrl: source,
          skillFolderHash: "",
          installedAt: existing?.installedAt || now,
          updatedAt: now,
        }
      }

      await writeSkillLock(lock)

      // Cleanup temp dir
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }

      return results
    },
  )

  // Search skills.sh from main process (avoids CORS)
  ipcMain.handle(
    "skills:search-catalog",
    async (
      _event,
      query: string,
      limit: number = 30,
      offset: number = 0,
    ): Promise<{ skills: { id: string; skillId: string; name: string; installs: number; source: string }[]; count: number }> => {
      const q = query.trim().length >= 2 ? query.trim() : "skill"
      const url = `https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`skills.sh search failed (HTTP ${res.status})`)
      const data = await res.json()
      return { skills: data.skills ?? [], count: data.count ?? 0 }
    },
  )

  // Fetch SKILL.md content from GitHub raw (avoids CORS)
  const branchCache = new Map<string, string>()

  ipcMain.handle(
    "skills:fetch-content",
    async (
      _event,
      source: string,
      skillId: string,
    ): Promise<string | null> => {
      // Resolve default branch
      let branch = branchCache.get(source)
      if (!branch) {
        try {
          const res = await fetch(`https://api.github.com/repos/${source}`)
          if (res.ok) {
            const data = await res.json()
            branch = data.default_branch || "main"
          } else {
            branch = "main"
          }
        } catch {
          branch = "main"
        }
        branchCache.set(source, branch)
      }

      const paths = [
        `skills/${skillId}/SKILL.md`,
        `skills/.curated/${skillId}/SKILL.md`,
        `skills/.experimental/${skillId}/SKILL.md`,
        `${skillId}/SKILL.md`,
        `SKILL.md`,
      ]

      for (const p of paths) {
        try {
          const res = await fetch(`https://raw.githubusercontent.com/${source}/${branch}/${p}`)
          if (res.ok) return await res.text()
        } catch {
          continue
        }
      }
      return null
    },
  )

  // Install a skill using the `npx skills add` CLI command
  ipcMain.handle(
    "skills:install-via-cli",
    async (
      _event,
      source: string,
    ): Promise<{ success: boolean; output: string; error?: string }> => {
      return new Promise((resolve) => {
        execFile(
          "npx",
          ["skills", "add", source, "--all", "-y"],
          { timeout: 120_000, shell: true },
          (error, stdout, stderr) => {
            if (error) {
              resolve({
                success: false,
                output: stdout || "",
                error: stderr || error.message,
              })
            } else {
              resolve({
                success: true,
                output: stdout || "",
              })
            }
          },
        )
      })
    },
  )

  ipcMain.handle(
    "skills:create",
    async (
      _event,
      data: { name: string; description?: string; content?: string; agentNames?: string[] },
    ) => {
      const trimmedName = data.name.trim()
      if (!trimmedName) {
        throw new Error("Skill name is required")
      }

      const safeName = sanitizeName(trimmedName)
      const canonicalDir = path.join(CANONICAL_SKILLS_DIR, safeName)
      const skillFilePath = path.join(canonicalDir, "SKILL.md")

      if (await dirExists(canonicalDir)) {
        throw new Error(`Skill "${trimmedName}" already exists`)
      }

      await fs.mkdir(canonicalDir, { recursive: true })
      const content = (data.content?.trim() || `---
name: ${safeName}
description: ${(data.description?.trim() || trimmedName).replace(/\n/g, " ")}
---

# ${trimmedName}

## Instructions

Add your skill instructions here.
`).trimEnd() + "\n"
      await fs.writeFile(skillFilePath, content, "utf-8")

      const detected = await detectAgents()
      const detectedNames = new Set(detected.map((agent) => agent.name))
      const targetAgents = getExpandedTargetAgents(data.agentNames ?? []).filter((agent) =>
        detectedNames.has(agent.name),
      )

      for (const agent of targetAgents) {
        await installSkillToAgent(canonicalDir, trimmedName, agent)
      }

      const lock = await readSkillLock()
      const now = new Date().toISOString()
      lock.skills[safeName] = {
        source: canonicalDir,
        sourceType: "local",
        originalUrl: canonicalDir,
        skillFolderHash: "",
        installedAt: now,
        updatedAt: now,
      }
      await writeSkillLock(lock)

      return {
        name: trimmedName,
        path: canonicalDir,
        targets: targetAgents.map((agent) => agent.name),
      }
    },
  )

  // Remove a skill from all agents + canonical dir + lock file
  ipcMain.handle("skills:remove", async (_event, name: string) => {
    const safeName = sanitizeName(name)

    // Remove from all agent directories
    for (const agent of Object.values(agentRegistry)) {
      const targetDir = path.join(agent.globalSkillsDir, safeName)
      try {
        const stat = await fs.lstat(targetDir)
        if (stat.isSymbolicLink()) {
          await fs.unlink(targetDir)
        } else {
          await fs.rm(targetDir, { recursive: true, force: true })
        }
      } catch {
        // Directory doesn't exist for this agent
      }
    }

    // Remove canonical directory
    const canonicalDir = path.join(CANONICAL_SKILLS_DIR, safeName)
    try {
      await fs.rm(canonicalDir, { recursive: true, force: true })
    } catch {
      // Best effort
    }

    // Remove from lock file
    const lock = await readSkillLock()
    delete lock.skills[safeName]
    await writeSkillLock(lock)
  })

  // Update a skill (re-install from source)
  ipcMain.handle("skills:update", async (_event, name: string) => {
    const safeName = sanitizeName(name)
    const lock = await readSkillLock()
    const entry = lock.skills[safeName]

    if (!entry?.originalUrl) {
      throw new Error(`No source recorded for skill "${name}". Cannot update.`)
    }

    // Re-install from the original source
    // This triggers the install handler logic internally
    const detected = await detectAgents()
    const agentNames = detected.map((a) => a.name)

    const parsed = parseSource(entry.originalUrl)
    if (!parsed) {
      throw new Error(`Cannot parse stored source: "${entry.originalUrl}"`)
    }

    let sourceDir: string
    let tmpDir: string | null = null

    if (parsed.type === "github") {
      tmpDir = path.join(os.tmpdir(), `skillsgate-upd-${Date.now()}`)
      const cloneResult = await gitClone(`${parsed.url}.git`, tmpDir)
      if (!cloneResult.success) {
        throw new Error(`Clone failed: ${cloneResult.error}`)
      }
      sourceDir = tmpDir
    } else {
      sourceDir = parsed.url
    }

    const discovered = await discoverSkillsInDir(sourceDir)
    // Find the specific skill we're updating
    const target = discovered.find(
      (s) => sanitizeName(s.name) === safeName,
    )

    if (!target) {
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
      throw new Error(`Skill "${name}" not found in source.`)
    }

    const skillDir = path.dirname(target.filePath)

    for (const agentName of agentNames) {
      const agent = agentRegistry[agentName]
      if (agent) {
        await installSkillToAgent(skillDir, target.name, agent)
      }
    }

    // Update lock entry timestamp
    lock.skills[safeName] = {
      ...entry,
      updatedAt: new Date().toISOString(),
    }
    await writeSkillLock(lock)

    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  })

  // -------------------------------------------------------------------------
  // Auth handlers
  // -------------------------------------------------------------------------

  // Load stored auth (shared with CLI)
  ipcMain.handle("auth:load", async () => {
    return loadAuth()
  })

  // Exchange a device code for an access token
  ipcMain.handle("auth:exchange", async (_event, code: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/device/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      const errorMsg =
        data?.error === "rate_limited"
          ? "Too many attempts. Wait a minute and try again."
          : data?.error === "invalid_code"
            ? "Invalid code. Check and try again."
            : data?.error === "expired"
              ? "Code has expired. Get a new one."
              : "Verification failed. Please try again."
      throw new Error(errorMsg)
    }

    const result = (await res.json()) as ExchangeResponse
    const stored: StoredAuth = {
      token: result.access_token,
      user: result.user,
    }
    saveAuthToDb(stored)
    return stored
  })

  // Logout
  ipcMain.handle("auth:logout", async () => {
    clearAuthFromDb()
  })

  // Open a URL in the default browser (only https)
  ipcMain.handle("auth:open-browser", async (_event, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Only http/https URLs are allowed")
      }
      await shell.openExternal(url)
    } catch (err) {
      throw new Error(`Invalid URL: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // -------------------------------------------------------------------------
  // Remote server handlers
  // -------------------------------------------------------------------------

  ipcMain.handle("servers:list", () => {
    const servers = serverStore.list()
    // Enrich with skill count
    return servers.map((s) => ({
      ...s,
      skillCount: skillStore.countByServer(s.id),
    }))
  })

  ipcMain.handle("servers:create", (_event, data) => {
    return serverStore.create(data)
  })

  ipcMain.handle("servers:update", (_event, id: string, fields) => {
    return serverStore.update(id, fields)
  })

  ipcMain.handle("servers:delete", (_event, id: string) => {
    serverStore.delete(id)
  })

  ipcMain.handle("servers:test", async (_event, id: string) => {
    const server = serverStore.get(id)
    if (!server) return { ok: false, error: "Server not found" }
    return testConnection(server)
  })

  ipcMain.handle("servers:sync", async (_event, id: string) => {
    const server = serverStore.get(id)
    if (!server) return { added: 0, updated: 0, removed: 0, unchanged: 0, error: "Server not found" }
    return syncRemoteServer({ remoteServers: serverStore, remoteSkills: skillStore }, server)
  })

  ipcMain.handle("servers:skills", (_event, serverId: string) => {
    return skillStore.listByServer(serverId)
  })

  ipcMain.handle("servers:read-skill", async (_event, serverId: string, remotePath: string) => {
    const server = serverStore.get(serverId)
    if (!server) {
      throw new Error("Server not found")
    }
    return readRemoteFile(server, remotePath)
  })

  ipcMain.handle(
    "servers:write-skill",
    async (_event, serverId: string, remotePath: string, content: string) => {
      const server = serverStore.get(serverId)
      if (!server) {
        throw new Error("Server not found")
      }
      await writeRemoteFile(server, remotePath, content)
      const contentHash = require("node:crypto")
        .createHash("sha256")
        .update(content, "utf-8")
        .digest("hex")
      skillStore.updateContent(serverId, remotePath, content, contentHash)
      return { ok: true }
    },
  )

  ipcMain.handle("servers:count", () => {
    return serverStore.count()
  })

  // -------------------------------------------------------------------------
  // Settings handlers
  // -------------------------------------------------------------------------

  ipcMain.handle("settings:get", (_event, key: string, defaultValue: unknown) => {
    return settingsStore.get(key, defaultValue)
  })

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    settingsStore.set(key, value)
  })

  ipcMain.handle("settings:all", () => {
    return settingsStore.getAll()
  })

  // -------------------------------------------------------------------------
  // Updates
  // -------------------------------------------------------------------------

  ipcMain.handle("updates:get-state", () => {
    return getUpdateState()
  })

  ipcMain.handle("updates:check", async () => {
    return checkForAppUpdates()
  })

  ipcMain.handle("updates:install", () => {
    quitAndInstallUpdate()
  })

  ipcMain.handle("app:get-version", () => {
    return app.getVersion()
  })

  // -------------------------------------------------------------------------
  // Skill editing & management
  // -------------------------------------------------------------------------

  // Write skill content back to disk
  ipcMain.handle("skill:write-content", async (_, filePath: string, content: string) => {
    // Validate the path is within allowed skill directories
    const resolved = path.resolve(filePath)
    if (!isSkillPathAllowed(resolved)) {
      throw new Error("Access denied: path is outside skill directories")
    }

    try {
      await fs.writeFile(resolved, content, "utf-8")
    } catch (err) {
      throw new Error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Open skill folder in Finder/Explorer
  ipcMain.handle("skill:open-in-finder", (_, filePath: string) => {
    // Validate the path is within allowed skill directories
    const resolved = path.resolve(filePath)
    if (!isSkillPathAllowed(resolved)) {
      throw new Error("Access denied: path is outside skill directories")
    }
    shell.showItemInFolder(resolved)
  })

  // Remove skill from a specific agent only (delete symlink, keep canonical)
  ipcMain.handle("skills:remove-from-agent", async (_, skillName: string, agentName: string) => {
    const safeName = sanitizeName(skillName)
    const agent = agentRegistry[agentName]
    if (!agent) throw new Error(`Unknown agent: ${agentName}`)
    const skillPath = path.join(agent.globalSkillsDir, safeName)
    try {
      await fs.rm(skillPath, { recursive: true, force: true })
    } catch (err) {
      throw new Error(`Failed to remove: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(
    "skills:add-to-agent",
    async (_event, skillName: string, canonicalPath: string, agentName: string) => {
      const safeName = sanitizeName(skillName)
      const agent = agentRegistry[agentName]
      if (!agent) throw new Error(`Unknown agent: ${agentName}`)

      const resolvedCanonical = path.resolve(canonicalPath)
      if (!resolvedCanonical.startsWith(path.resolve(CANONICAL_SKILLS_DIR))) {
        throw new Error("Access denied: canonical path is outside local skill storage")
      }

      const result = await installSkillToAgent(resolvedCanonical, safeName, agent)
      if (!result.success) {
        throw new Error(result.error || "Failed to add skill to target agent")
      }
    },
  )
}

// Export for use by file-watcher and main process
export { listInstalledSkills, rescanAndCache, detectAgents, agentRegistry }
