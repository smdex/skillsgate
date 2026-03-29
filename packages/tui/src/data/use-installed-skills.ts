import { useEffect } from "react"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import matter from "gray-matter"
import { useStore, useDispatch } from "../store/context.js"
import { useDb } from "../db/context.js"
import { agents } from "../../../cli/src/core/agents.js"
import { readSkillLock } from "../../../cli/src/core/skill-lock.js"
import { SKILL_MD } from "../../../cli/src/constants.js"
import type { EnrichedSkill } from "../store/types.js"
import type { AgentType, SkillLockFile } from "../../../cli/src/types.js"

const home = os.homedir()
const PROJECT_PROBES = [
  ".claude/skills",
  ".cursor/skills",
  ".cursor/rules",
  ".codex/skills",
  ".github/skills",
  ".windsurf/skills",
  ".continue/skills",
  ".cline/skills",
  ".amp/skills",
  ".opencode/skills",
  ".goose/skills",
  ".junie/skills",
  ".kilo-code/skills",
  ".pear-ai/skills",
  ".roo-code/skills",
  ".trae/skills",
  ".zed/skills",
  ".agents/skills",
]

function getScopeForPath(resolvedPath: string): "global" | "project" | "custom" {
  const globalRoots = [
    path.join(home, ".agents", "skills"),
    ...Object.values(agents).map((agent) => agent.globalSkillsDir),
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

async function listSupportingFiles(skillDir: string): Promise<Array<{ relativePath: string; size: number }>> {
  const files: Array<{ relativePath: string; size: number }> = []

  async function walk(currentDir: string, prefix = ""): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      const relativePath = prefix ? path.join(prefix, entry.name) : entry.name

      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath)
        continue
      }

      if (!entry.isFile() || relativePath === SKILL_MD) continue
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

/**
 * Scans all detected agent globalSkillsDir paths for SKILL.md files,
 * parses them with gray-matter, enriches with lock file data, and
 * populates the store.
 */
export function useInstalledSkills() {
  const dispatch = useDispatch()
  const { installedLoading } = useStore()
  const { settings } = useDb()

  useEffect(() => {
    // Only scan when installedLoading is true (initial mount or refresh triggered)
    if (!installedLoading) return

    let cancelled = false

    async function scan() {
      dispatch({ type: "SET_INSTALLED_LOADING", loading: true })

      try {
        const lock = await readSkillLock()
        // Map: skillName -> EnrichedSkill (deduplicating across agents)
        const skillMap = new Map<string, EnrichedSkill>()

        // Scan each agent's global skills directory
        for (const agent of Object.values(agents)) {
          const skillsDir = agent.globalSkillsDir
          try {
            const entries = await fs.readdir(skillsDir, { withFileTypes: true })
            for (const entry of entries) {
              // Include both real directories and symlinks (skills are often symlinked)
              if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

              const skillDirPath = path.join(skillsDir, entry.name)
              const canonicalPath = await fs.realpath(skillDirPath).catch(() => skillDirPath)
              const skillMdPath = path.join(skillDirPath, SKILL_MD)
              try {
                const raw = await fs.readFile(skillMdPath, "utf-8")
                const { data: frontmatter } = matter(raw)
                const skillName = entry.name
                const canonicalPath = await fs.realpath(skillDirPath).catch(() => skillDirPath)
                const scope = getScopeForPath(canonicalPath)
                const supportingFiles = await listSupportingFiles(canonicalPath)

                const existing = skillMap.get(canonicalPath)
                if (existing) {
                  // Skill already seen from another agent - add this agent
                  if (!existing.agents.includes(agent.name)) {
                    existing.agents.push(agent.name)
                  }
                } else {
                  skillMap.set(canonicalPath, {
                    name: skillName,
                    description:
                      (frontmatter.description as string) ??
                      extractFirstLine(raw),
                    filePath: skillMdPath,
                    canonicalPath,
                    agents: [agent.name],
                    scope,
                    projectName:
                      scope === "project" ? getProjectNameForPath(canonicalPath) : null,
                    hasSupportingFiles: supportingFiles.length > 0,
                    supportingFiles,
                    metadata: frontmatter as Record<string, unknown>,
                    lock: lock.skills[skillName],
                  })
                }
              } catch {
                // SKILL.md not found or unreadable in this directory - skip
              }
            }
          } catch {
            // Agent skills directory doesn't exist - skip
          }
        }

        const customScanPaths = settings.get<string[]>("scan.customPaths", [])
        for (const customPath of customScanPaths) {
          const resolvedRoot = path.resolve(customPath.replace(/^~(?=$|\/|\\)/, home))
          const collected = await collectCustomSkills(resolvedRoot, lock)
          for (const skill of collected) {
            if (!skillMap.has(skill.canonicalPath)) {
              skillMap.set(skill.canonicalPath, skill)
            }
          }
        }

        if (cancelled) return

        const skills = Array.from(skillMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        )

        dispatch({ type: "SET_INSTALLED_SKILLS", skills })

        // Update agent skill counts (without removing agents that have 0 skills)
        const agentCounts = new Map<AgentType, number>()
        for (const skill of skills) {
          for (const agentName of skill.agents) {
            agentCounts.set(agentName, (agentCounts.get(agentName) ?? 0) + 1)
          }
        }

        dispatch({ type: "UPDATE_AGENT_COUNTS", counts: Object.fromEntries(agentCounts) })
      } catch {
        if (!cancelled) {
          dispatch({ type: "SET_INSTALLED_SKILLS", skills: [] })
        }
      }
    }

    scan()
    return () => { cancelled = true }
  }, [installedLoading])
}

async function collectCustomSkills(
  rootPath: string,
  lock: SkillLockFile,
): Promise<EnrichedSkill[]> {
  const results: EnrichedSkill[] = []

  async function maybeCollect(skillDir: string, scope: "project" | "custom") {
    const skillMdPath = path.join(skillDir, SKILL_MD)
    try {
      const raw = await fs.readFile(skillMdPath, "utf-8")
      const { data: frontmatter } = matter(raw)
      const canonicalPath = await fs.realpath(skillDir).catch(() => skillDir)
      const folderName = path.basename(skillDir)
      const supportingFiles = await listSupportingFiles(canonicalPath)
      results.push({
        name: String((frontmatter.name as string) ?? folderName),
        description:
          (frontmatter.description as string) ?? extractFirstLine(raw),
        filePath: skillMdPath,
        canonicalPath,
        agents: [],
        scope,
        projectName:
          scope === "project" ? getProjectNameForPath(canonicalPath) : null,
        hasSupportingFiles: supportingFiles.length > 0,
        supportingFiles,
        metadata: frontmatter as Record<string, unknown>,
        lock: lock.skills[folderName],
      })
    } catch {
      // ignore
    }
  }

  await maybeCollect(rootPath, "custom")

  let entries: Array<{ name: string; isDirectory: () => boolean }> = []
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    await maybeCollect(path.join(rootPath, entry.name), "custom")
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const projectRoot = path.join(rootPath, entry.name)
    for (const probe of PROJECT_PROBES) {
      const probeDir = path.join(projectRoot, probe)
      let probeEntries: Array<{ name: string; isDirectory: () => boolean }> = []
      try {
        probeEntries = await fs.readdir(probeDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const skillEntry of probeEntries) {
        if (!skillEntry.isDirectory()) continue
        await maybeCollect(path.join(probeDir, skillEntry.name), "project")
      }
    }
  }

  return results
}

/** Extracts the first non-empty, non-heading line from markdown content. */
function extractFirstLine(content: string): string {
  const lines = content.split("\n")
  // Skip frontmatter delimiter and heading lines
  let pastFrontmatter = false
  let frontmatterCount = 0
  for (const line of lines) {
    if (line.trim() === "---") {
      frontmatterCount++
      if (frontmatterCount >= 2) {
        pastFrontmatter = true
        continue
      }
      continue
    }
    if (!pastFrontmatter) continue
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("#")) continue
    return trimmed.slice(0, 120)
  }
  return ""
}
