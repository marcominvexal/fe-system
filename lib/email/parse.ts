/**
 * /lib/email/parse.ts — recognise and parse Orange Business OBSLink
 * notification emails. Pure functions, no I/O, no imports.
 *
 * Three notification types are understood (all sent by noreply@orange.com,
 * linked only by the work order number in the subject — they are NOT a
 * reply thread):
 *   dispatch  "OBS Work Order Ref : 18531881-1, Site:GSK-PAK-KAR, ASP:…"
 *   photo     "Work Order ID :18531881-1_<file> … uploaded on FS Storage"
 *   cleared   "Work Order No:18531881-1 Status:Cleared, Site:…, ASP:…"
 */

export interface OnSiteTimesParsed {
  travelStart?: string;
  arriveOnSite?: string;
  workStart?: string;
  workStop?: string;
  leaveSite?: string;
  travelStop?: string;
}

export type ParsedEmail =
  | {
      kind: "dispatch";
      workOrder: string;
      siteId?: string;
      asp?: string;
      endCustomer?: string;
      siteName?: string;
      address?: string;
      city?: string;
      product?: string;
      serial?: string;
      assignedBy?: string;
      description?: string;
      contactName?: string;
      contactPhone?: string;
      scheduledAt?: string; // ISO (UTC)
      openedAt?: string;    // ISO (UTC)
    }
  | {
      kind: "cleared";
      workOrder: string;
      status: string;       // "Cleared" (other OBS statuses are passed through)
      siteId?: string;
      onSite: OnSiteTimesParsed;
      closureComment?: string;
      parts?: string;
      releasedNote?: string;
      description?: string;
    }
  | { kind: "photo"; workOrder: string; fileName: string };

/** Offset used for the local timestamps OBSLink prints (Pakistan, no DST). */
export const LOCAL_UTC_OFFSET = "+05:00";

const WO = String.raw`(\d{6,}-\d+)`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function norm(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/ /g, " ");
}

/** Drop the bilingual Orange legal footer and anything after it. */
function stripFooter(text: string): string {
  const i = text.search(/_{20,}\s*\n\s*Ce message et ses pi/i);
  return i >= 0 ? text.slice(0, i) : text;
}

/** Remove portal links — the OBSLink URL carries a partner login token. */
export function stripLinks(text: string): string {
  return text
    .replace(/<\s*https?:\/\/[^>\s]*>/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/<\s*mailto:[^>]*>/gi, "");
}

function field(text: string, label: string): string | undefined {
  const re = new RegExp(String.raw`^[ \t]*${label}[ \t]*:[ \t]*(.*)$`, "im");
  const v = text.match(re)?.[1]?.trim();
  return v ? v : undefined;
}

function between(text: string, start: RegExp, end: RegExp): string | undefined {
  const s = text.search(start);
  if (s < 0) return undefined;
  const from = text.slice(s).replace(start, "");
  const e = from.search(end);
  const out = (e >= 0 ? from.slice(0, e) : from).trim();
  return out || undefined;
}

/** "(GMT)09/29/2026 03:30:00" → ISO UTC */
function gmtToIso(v?: string): string | undefined {
  const m = v?.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  const [, mm, dd, yyyy, hh, mi, ss = "00"] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`).toISOString();
}

/** "2026-09-29 09:06:00" (site local time) → ISO UTC */
function localToIso(v: string): string {
  return new Date(`${v.replace(" ", "T")}${LOCAL_UTC_OFFSET}`).toISOString();
}

function tidyBlock(s?: string): string | undefined {
  if (!s) return undefined;
  const out = stripLinks(s)
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out || undefined;
}

// ── Classification ───────────────────────────────────────────────────────────
export function classify(subject: string): { kind: ParsedEmail["kind"]; workOrder: string } | null {
  const s = subject.replace(/\s+/g, " ");
  let m = s.match(new RegExp(String.raw`OBS Work Order Ref\s*:\s*${WO}`, "i"));
  if (m) return { kind: "dispatch", workOrder: m[1] };
  m = s.match(new RegExp(String.raw`Work Order No\s*:\s*${WO}\s*Status\s*:`, "i"));
  if (m) return { kind: "cleared", workOrder: m[1] };
  m = s.match(new RegExp(String.raw`Work Order ID\s*:\s*${WO}_`, "i"));
  if (m) return { kind: "photo", workOrder: m[1] };
  return null;
}

// ── Parsers ──────────────────────────────────────────────────────────────────
export function parseEmail(subject: string, body: string): ParsedEmail | null {
  const c = classify(subject);
  if (!c) return null;
  const text = stripFooter(norm(body));
  const subj = subject.replace(/\s+/g, " ");
  const siteFromSubject = subj.match(/Site\s*:\s*([^,]+)/i)?.[1]?.trim();
  const aspFromSubject = subj.match(/ASP\s*:\s*(.+)$/i)?.[1]?.trim();

  if (c.kind === "photo") {
    const fileName = subj.match(new RegExp(String.raw`Work Order ID\s*:\s*${WO}_(.+)$`, "i"))?.[2]?.trim() ?? "attachment";
    return { kind: "photo", workOrder: c.workOrder, fileName };
  }

  if (c.kind === "dispatch") {
    // Address runs over two lines: street, then "City, , Postcode, Country"
    const addrMatch = text.match(/^[ \t]*Address[ \t]*:[ \t]*(.*)\n[ \t]*(.*)$/im);
    const address = addrMatch
      ? [addrMatch[1], addrMatch[2]].map((x) => x.trim()).filter(Boolean).join(", ").replace(/(,\s*)+,/g, ",")
      : undefined;
    const city = addrMatch?.[2]?.split(",")[0]?.trim() || undefined;
    const description = tidyBlock(between(text, /Default Description\s*:/i, /Customer Appointment Date/i));
    const onSite = description ? between(description, /ON-SITE DETAILS/i, /Site address|Asset location/i) : undefined;
    const product = field(text, "Product");
    const serial = field(text, "Serial No");
    return {
      kind: "dispatch",
      workOrder: c.workOrder,
      siteId: field(text, "Site ID") ?? siteFromSubject,
      asp: aspFromSubject,
      endCustomer: field(text, "Customer Name"),
      siteName: field(text, "Site Name"),
      address,
      city,
      product: [product, serial && `S/N ${serial}`].filter(Boolean).join(" · ") || undefined,
      serial,
      assignedBy: field(text, "Assigned By"),
      description,
      contactName: onSite ? field(onSite, "Contact name") : undefined,
      contactPhone: onSite ? field(onSite, "Mobile number") : undefined,
      scheduledAt: gmtToIso(field(text, "ETA Early Start")),
      openedAt: gmtToIso(field(text, "Open Date/Time")),
    };
  }

  // cleared (or another OBS status)
  const status = subj.match(/Status\s*:\s*([A-Za-z ]+?)\s*(?:,|$)/i)?.[1]?.trim() ?? "Unknown";
  const tsBlock = between(text, /Timestamps Info/i, /closure comment|No Part selected|$/i) ?? "";
  const stamps = [...tsBlock.matchAll(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?/g)].map((m) => localToIso(m[0]));
  const keys: (keyof OnSiteTimesParsed)[] = ["travelStart", "arriveOnSite", "workStart", "workStop", "leaveSite", "travelStop"];
  const onSite: OnSiteTimesParsed = {};
  keys.forEach((k, i) => { if (stamps[i]) onSite[k] = stamps[i]; });

  const closureComment = tidyBlock(between(text, /^[ \t]*Closure comment[ \t]*$/im, /No Part selected|Part(s)? (used|selected)|$/i));
  const parts = /No Part selected/i.test(text) ? "No parts used" : tidyBlock(between(text, /Part(s)? (used|selected)\s*:?/i, /\n\s*\n/));
  return {
    kind: "cleared",
    workOrder: c.workOrder,
    status,
    siteId: siteFromSubject,
    onSite,
    closureComment,
    parts,
    releasedNote: field(text, "ASP FE Released from site by") ? `FE released from site by ${field(text, "ASP FE Released from site by")}` : undefined,
    description: tidyBlock(between(text, /^[ \t]*Description[ \t]*$/im, /Timestamps Info/i))?.replace(/^_+\s*/gm, "").trim(),
  };
}

/** Status notifications that mean the visit is finished. Others (e.g. "Dispatch Rescheduled") are updates. */
export const isClosureStatus = (status: string) => /cleared|closed|completed|resolved/i.test(status);

/** Orange status from a "Work Order No:… Status:…" subject, if any. */
export function statusFromSubject(subject: string): string | undefined {
  return subject.replace(/\s+/g, " ").match(/Status\s*:\s*([A-Za-z ]+?)\s*(?:,|$)/i)?.[1]?.trim();
}

/** Billable visit length from minutes on site (arrive → leave). */
export function visitBand(minutes: number): "2h" | "Half Day" | "Full Day" {
  if (minutes <= 150) return "2h";
  if (minutes <= 300) return "Half Day";
  return "Full Day";
}
