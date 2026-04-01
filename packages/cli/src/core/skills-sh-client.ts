/**
 * skills.sh API client — searches the public skill registry
 * and resolves SKILL.md content from GitHub.
 */

const SKILLS_SH_API = "https://skills.sh/api";

export interface SkillsShSkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string; // "owner/repo"
}

export interface SkillsShSearchResponse {
  skills: SkillsShSkill[];
  count: number;
}

// Simple in-memory caches to avoid repeated GitHub API calls
const branchCache = new Map<string, string>();
const treeCache = new Map<string, string[]>();

/**
 * Search skills.sh public catalog.
 */
export async function searchSkillsSh(
  query: string,
  limit = 30
): Promise<SkillsShSearchResponse> {
  const encoded = encodeURIComponent(query);
  const url = `${SKILLS_SH_API}/search?q=${encoded}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`skills.sh search failed (HTTP ${res.status})`);
  }

  return (await res.json()) as SkillsShSearchResponse;
}

/**
 * Fetch SKILL.md content for a skill from GitHub.
 * Tries conventional paths first, falls back to tree API.
 */
export async function fetchSkillContent(
  source: string,
  skillId: string
): Promise<string | null> {
  const branch = await getDefaultBranch(source);

  // Try conventional paths first (no tree API needed)
  const content = await fetchContentAtConventionalPaths(
    source,
    skillId,
    branch
  );
  if (content) return content;

  // Fallback: search repo tree for matching SKILL.md
  return fetchContentViaTreeAPI(source, skillId, branch);
}

async function fetchContentAtConventionalPaths(
  source: string,
  skillId: string,
  branch: string
): Promise<string | null> {
  const paths = [
    `skills/${skillId}/SKILL.md`,
    `skills/.curated/${skillId}/SKILL.md`,
    `skills/.experimental/${skillId}/SKILL.md`,
    `${skillId}/SKILL.md`,
    `SKILL.md`,
  ];

  for (const p of paths) {
    const url = `https://raw.githubusercontent.com/${source}/${branch}/${p}`;
    try {
      const res = await fetch(url);
      if (res.status !== 200) continue;
      const content = await res.text();

      // For root SKILL.md, verify it matches the skill we're looking for
      if (p === "SKILL.md") {
        const name = parseFrontmatterName(content);
        if (name !== skillId) continue;
      }

      return content;
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchContentViaTreeAPI(
  source: string,
  skillId: string,
  branch: string
): Promise<string | null> {
  const paths = await getSkillPaths(source, branch);

  for (const p of paths) {
    const url = `https://raw.githubusercontent.com/${source}/${branch}/${p}`;
    try {
      const res = await fetch(url);
      if (res.status !== 200) continue;
      const content = await res.text();

      const name = parseFrontmatterName(content);
      if (name === skillId) return content;
    } catch {
      continue;
    }
  }

  return null;
}

async function getDefaultBranch(source: string): Promise<string> {
  const cached = branchCache.get(source);
  if (cached) return cached;

  const res = await fetch(`https://api.github.com/repos/${source}`);
  if (res.status === 403) throw new Error("GitHub API rate limit reached");
  if (!res.ok) throw new Error(`Failed to fetch repo info for ${source}`);

  const data = (await res.json()) as { default_branch: string };
  branchCache.set(source, data.default_branch);
  return data.default_branch;
}

async function getSkillPaths(
  source: string,
  branch: string
): Promise<string[]> {
  const key = `${source}@${branch}`;
  const cached = treeCache.get(key);
  if (cached) return cached;

  const res = await fetch(
    `https://api.github.com/repos/${source}/git/trees/${branch}?recursive=1`
  );
  if (res.status === 403) throw new Error("GitHub API rate limit reached");
  if (!res.ok) throw new Error(`Failed to fetch repo tree for ${source}`);

  const data = (await res.json()) as {
    tree: { path: string; type: string }[];
  };

  const paths = data.tree
    .filter(
      (e) =>
        e.type === "blob" &&
        (e.path === "SKILL.md" || e.path.endsWith("/SKILL.md"))
    )
    .map((e) => e.path);

  treeCache.set(key, paths);
  return paths;
}

function parseFrontmatterName(content: string): string | null {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") break;
    if (line.startsWith("name:")) {
      return line
        .slice(5)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  return null;
}
