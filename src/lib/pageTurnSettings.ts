/** Clés alignées sur le panneau « effet des pages » (front + Turn.js). */

export const PAGE_TURN_SETTING_KEYS = [
  "soundOnTurn",
  "pageEdges",
  "rtlRead",
  "showPageDepth",
  "showPageShadow",
  "roundedCorners",
  "centerWhenSingle",
] as const;

export type PageTurnSettingKey = (typeof PAGE_TURN_SETTING_KEYS)[number];

export type PageTurnSettings = Record<PageTurnSettingKey, boolean>;

export const defaultPageTurnSettings: PageTurnSettings = {
  soundOnTurn: true,
  pageEdges: true,
  rtlRead: false,
  showPageDepth: true,
  showPageShadow: true,
  roundedCorners: false,
  centerWhenSingle: true,
};

export function mergePageTurnSettings(
  raw: unknown,
): PageTurnSettings {
  const out = { ...defaultPageTurnSettings };
  if (raw === null || raw === undefined) return out;
  if (typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const key of PAGE_TURN_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(o, key)) {
      const v = o[key];
      if (typeof v === "boolean") out[key] = v;
    }
  }
  return out;
}

export function parsePageTurnSettingsBody(
  value: unknown,
):
  | { ok: true; value: PageTurnSettings }
  | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return {
      ok: false,
      error: "pageTurnSettings must be an object (send null without wrapping to clear via API contract)",
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "pageTurnSettings must be a JSON object" };
  }
  const o = value as Record<string, unknown>;
  const unknown = Object.keys(o).filter(
    (k) => !PAGE_TURN_SETTING_KEYS.includes(k as PageTurnSettingKey),
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `pageTurnSettings: unknown keys: ${unknown.join(", ")}`,
    };
  }
  for (const key of PAGE_TURN_SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(o, key)) continue;
    const v = o[key];
    if (typeof v !== "boolean") {
      return { ok: false, error: `pageTurnSettings.${key} must be a boolean` };
    }
  }
  return { ok: true, value: mergePageTurnSettings(value) };
}
