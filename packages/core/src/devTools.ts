export type DevJump = { url: string; title: string };
export type DevDecoded = { summary: string; value: string };

const SEARCHES: Record<string, { name: string; url: (q: string) => string }> = {
  npm: {
    name: "npm",
    url: (q) => (/^(@[\w.-]+\/)?[\w.-]+$/.test(q) ? `https://www.npmjs.com/package/${q}` : `https://www.npmjs.com/search?q=${encodeURIComponent(q)}`),
  },
  mdn: { name: "MDN", url: (q) => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(q)}` },
  caniuse: { name: "Can I use", url: (q) => `https://caniuse.com/?search=${encodeURIComponent(q)}` },
  so: { name: "Stack Overflow", url: (q) => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}` },
};

export function devJump(query: string, currentUrl?: string): DevJump | null {
  const match = /^(\S+)\s+(\S.*)$/.exec(query.trim());
  if (!match) return null;
  const keyword = match[1]!.toLowerCase();
  const arg = match[2]!.trim();
  if (keyword === "gh") return githubJump(arg, currentUrl);
  const search = SEARCHES[keyword];
  return search ? { url: search.url(arg), title: `${arg} on ${search.name}` } : null;
}

function githubJump(arg: string, currentUrl?: string): DevJump {
  if (/^[\w.-]+\/[\w.-]+$/.test(arg)) return { url: `https://github.com/${arg}`, title: `${arg} on GitHub` };
  const number = /^#?(\d+)$/.exec(arg)?.[1];
  const repo = currentUrl ? /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)/.exec(currentUrl)?.[1] : undefined;
  if (number && repo) return { url: `https://github.com/${repo}/pull/${number}`, title: `${repo}#${number} on GitHub` };
  return { url: `https://github.com/search?q=${encodeURIComponent(arg)}`, title: `Search GitHub for ${arg}` };
}

export function devDecode(text: string, now: number): DevDecoded | null {
  const q = text.trim();
  return decodeJwt(q, now) ?? decodeTimestamp(q, now);
}

function base64UrlJson(part: string): unknown {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function decodeJwt(q: string, now: number): DevDecoded | null {
  const parts = q.split(".");
  if (parts.length !== 3 || !parts[0]!.startsWith("eyJ") || /\s/.test(q)) return null;
  try {
    const header = base64UrlJson(parts[0]!) as Record<string, unknown>;
    const payload = base64UrlJson(parts[1]!) as Record<string, unknown>;
    if (!header || typeof header !== "object" || !payload || typeof payload !== "object") return null;
    const facts = [
      typeof header.alg === "string" && `alg ${header.alg}`,
      (typeof payload.sub === "string" || typeof payload.sub === "number") && `sub ${payload.sub}`,
      typeof payload.exp === "number" && expiry(payload.exp * 1000 - now),
    ].filter(Boolean);
    return { summary: ["JWT", ...facts].join(" · "), value: JSON.stringify(payload) };
  } catch {
    return null;
  }
}

function expiry(ms: number): string {
  return ms < 0 ? `expired ${relative(-ms)} ago` : `expires in ${relative(ms)}`;
}

function decodeTimestamp(q: string, now: number): DevDecoded | null {
  if (!/^\d{10}(\d{3})?$/.test(q)) return null;
  const date = new Date(q.length === 10 ? Number(q) * 1000 : Number(q));
  const ms = date.getTime() - now;
  return { summary: `Unix time · ${ms < 0 ? `${relative(-ms)} ago` : `in ${relative(ms)}`}`, value: date.toISOString() };
}

function relative(ms: number): string {
  const units: [number, string][] = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [size, unit] of units) if (ms >= size) return `${Math.floor(ms / size)}${unit}`;
  return `${Math.floor(ms / 1000)}s`;
}
