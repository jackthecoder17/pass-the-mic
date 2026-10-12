import type { Player } from "@/game/store";

type Look = Partial<Pick<Player, "photo" | "c" | "f" | "name">> | null | undefined;
const cssUrl = (u?: string | null) => (/^https:\/\//.test(u || "") ? encodeURI(u!).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29") : "");

// every player keeps a colour + face (or their photo) for the whole game
export function Avatar({ p, size = "", extra = "" }: { p: Look; size?: string; extra?: string }) {
  const url = cssUrl(p?.photo);
  if (url) return <span className={`av ${size} c${p?.c || 1} photo ${extra}`} style={{ backgroundImage: `url('${url}')` }} role="img" aria-label={p?.name || "player"} />;
  return <span className={`av ${size} c${p?.c || 1} ${extra}`}>{p?.f || "🎤"}</span>;
}
