/** robots.txt parser with per-bot verdicts including the rule that decided. */

export interface RobotsGroup {
  userAgents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface BotVerdict {
  bot: string;
  allowed: boolean;
  matchedRule: string | null;
}

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasUa = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!lastLineWasUa || !current) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      lastLineWasUa = true;
      continue;
    }
    lastLineWasUa = false;
    if (key === "allow" || key === "disallow") {
      if (!current) {
        current = { userAgents: ["*"], rules: [] };
        groups.push(current);
      }
      current.rules.push({ type: key, path: value });
    }
  }
  return { groups, sitemaps };
}

function groupFor(robots: ParsedRobots, agent: string): { group: RobotsGroup; ua: string } | null {
  const a = agent.toLowerCase();
  let exact: { group: RobotsGroup; ua: string } | null = null;
  let wildcard: { group: RobotsGroup; ua: string } | null = null;
  for (const g of robots.groups) {
    for (const ua of g.userAgents) {
      if (ua !== "*" && (a.includes(ua) || ua.includes(a)) && !exact) exact = { group: g, ua };
      if (ua === "*" && !wildcard) wildcard = { group: g, ua: "*" };
    }
  }
  return exact ?? wildcard;
}

/** Longest-match wins; allow wins ties; empty Disallow allows all. */
export function verdictFor(robots: ParsedRobots, bot: string, path = "/"): BotVerdict {
  const match = groupFor(robots, bot);
  if (!match) return { bot, allowed: true, matchedRule: null };

  let bestLen = -1;
  let allowed = true;
  let rule: string | null = null;
  for (const r of match.group.rules) {
    if (r.path === "" && r.type === "disallow") continue;
    if (!path.startsWith(r.path)) continue;
    const len = r.path.length;
    if (len > bestLen || (len === bestLen && r.type === "allow")) {
      bestLen = len;
      allowed = r.type === "allow";
      const label = r.type === "allow" ? "Allow" : "Disallow";
      rule = `User-agent: ${match.ua} / ${label}: ${r.path}`;
    }
  }
  return { bot, allowed, matchedRule: rule };
}
