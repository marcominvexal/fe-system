/**
 * /lib/geo.ts — where a site is, and how far it is from the nearest Multinet
 * data centre (client-safe).
 *
 * Under the contract, a visit's distance band is measured from Multinet's
 * data centres. Sites are located by city (from the email's address, the
 * city Orange or the AI reader gave, or a city code in the site ID), the
 * straight-line distance to the nearest data centre is multiplied by a road
 * factor, and the result is put in a band. Coordinates are approximate,
 * which is fine for 50 km and 100 km bands; exact distances for particular
 * sites can be set as overrides.
 */
import type { DistanceBand } from "./pricing";

export interface DataCentre { name: string; lat: number; lng: number }

/** Multinet's three data centres (approximate positions; editable in Contract & rates). */
export const MULTINET_DATA_CENTRES: DataCentre[] = [
  { name: "Multinet Karachi (Korangi Industrial Area)", lat: 24.8335, lng: 67.1375 },
  { name: "Multinet Lahore (NTC Building, Race Course Road)", lat: 31.5525, lng: 74.3285 },
  { name: "Multinet Islamabad (Blue Area)", lat: 33.7155, lng: 73.0750 },
];

interface City { name: string; lat: number; lng: number; codes?: string[]; aliases?: string[] }

// Pakistani cities likely to host Orange Business customer sites, with the
// three-letter codes that appear in Orange site IDs (e.g. PK-SWN-FAC, GSK-PAK-KAR)
const CITIES: City[] = [
  { name: "Karachi", lat: 24.8607, lng: 67.0011, codes: ["KAR", "KHI", "KRC"], aliases: ["korangi", "clifton", "port qasim", "landhi", "saddar karachi"] },
  { name: "Lahore", lat: 31.5204, lng: 74.3587, codes: ["LHR", "LHE", "LAH"], aliases: ["raiwind road"] },
  { name: "Islamabad", lat: 33.6844, lng: 73.0479, codes: ["ISB", "ISL"] },
  { name: "Rawalpindi", lat: 33.5651, lng: 73.0169, codes: ["RWP", "RWL"], aliases: ["pindi"] },
  { name: "Faisalabad", lat: 31.4504, lng: 73.1350, codes: ["FSD", "LYP"] },
  { name: "Multan", lat: 30.1575, lng: 71.5249, codes: ["MUX", "MLT"] },
  { name: "Hyderabad", lat: 25.3960, lng: 68.3578, codes: ["HDD", "HYD"] },
  { name: "Peshawar", lat: 34.0151, lng: 71.5249, codes: ["PEW", "PSH"] },
  { name: "Quetta", lat: 30.1798, lng: 66.9750, codes: ["UET", "QTA"] },
  { name: "Gujranwala", lat: 32.1877, lng: 74.1945, codes: ["GRW"] },
  { name: "Sialkot", lat: 32.4945, lng: 74.5229, codes: ["SKT"] },
  { name: "Sahiwal", lat: 30.6682, lng: 73.1114, codes: ["SWN", "SHW"] },
  { name: "Mardan", lat: 34.1986, lng: 72.0404, codes: ["MDN", "MDX"] },
  { name: "Swabi", lat: 34.1205, lng: 72.4699 },
  { name: "Sargodha", lat: 32.0836, lng: 72.6711, codes: ["SGI"] },
  { name: "Bahawalpur", lat: 29.3956, lng: 71.6836, codes: ["BHV"] },
  { name: "Sukkur", lat: 27.7052, lng: 68.8574, codes: ["SKZ"] },
  { name: "Larkana", lat: 27.5570, lng: 68.2028 },
  { name: "Sheikhupura", lat: 31.7167, lng: 73.9850 },
  { name: "Gujrat", lat: 32.5736, lng: 74.0790 },
  { name: "Kasur", lat: 31.1187, lng: 74.4630 },
  { name: "Okara", lat: 30.8138, lng: 73.4534 },
  { name: "Rahim Yar Khan", lat: 28.4202, lng: 70.2952, codes: ["RYK"] },
  { name: "Sadiqabad", lat: 28.3091, lng: 70.1307 },
  { name: "Dera Ghazi Khan", lat: 30.0459, lng: 70.6403, codes: ["DEA"] },
  { name: "Dera Ismail Khan", lat: 31.8314, lng: 70.9019, codes: ["DSK"] },
  { name: "Jhelum", lat: 32.9405, lng: 73.7276 },
  { name: "Wah Cantt", lat: 33.7715, lng: 72.7518, aliases: ["wah"] },
  { name: "Taxila", lat: 33.7463, lng: 72.8397 },
  { name: "Attock", lat: 33.7660, lng: 72.3609 },
  { name: "Abbottabad", lat: 34.1688, lng: 73.2215 },
  { name: "Murree", lat: 33.9070, lng: 73.3943 },
  { name: "Nowshera", lat: 34.0153, lng: 71.9747 },
  { name: "Kohat", lat: 33.5869, lng: 71.4429, codes: ["OHT"] },
  { name: "Mingora", lat: 34.7717, lng: 72.3602, aliases: ["swat"] },
  { name: "Chakwal", lat: 32.9328, lng: 72.8630 },
  { name: "Jhang", lat: 31.2681, lng: 72.3181 },
  { name: "Chiniot", lat: 31.7200, lng: 72.9789 },
  { name: "Khanewal", lat: 30.3017, lng: 71.9321 },
  { name: "Vehari", lat: 30.0452, lng: 72.3489 },
  { name: "Pakpattan", lat: 30.3436, lng: 73.3900 },
  { name: "Hafizabad", lat: 32.0712, lng: 73.6880 },
  { name: "Mandi Bahauddin", lat: 32.5861, lng: 73.4917 },
  { name: "Nawabshah", lat: 26.2442, lng: 68.4100, aliases: ["shaheed benazirabad"], codes: ["WNS"] },
  { name: "Mirpur Khas", lat: 25.5276, lng: 69.0111 },
  { name: "Thatta", lat: 24.7461, lng: 67.9235 },
  { name: "Hub", lat: 25.0490, lng: 66.8920 },
  { name: "Kotri", lat: 25.3657, lng: 68.3087 },
  { name: "Daharki", lat: 28.0442, lng: 69.6964 },
  { name: "Gwadar", lat: 25.1216, lng: 62.3254, codes: ["GWD"] },
  { name: "Muzaffarabad", lat: 34.3700, lng: 73.4711 },
  { name: "Mirpur", lat: 33.1478, lng: 73.7517 },
  { name: "Gilgit", lat: 35.9208, lng: 74.3089, codes: ["GIL"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[_\-,./]+/g, " ").replace(/\s+/g, " ");

/** The city a site is in, from free text (an address or a city name). */
export function cityInText(text?: string): City | null {
  if (!text) return null;
  const t = ` ${norm(text)} `;
  // Longest names first, so "Dera Ghazi Khan" beats "Khan" and "Mirpur Khas" beats "Mirpur"
  const names = CITIES.flatMap((c) => [c.name, ...(c.aliases ?? [])].map((n) => ({ c, n: norm(n) })))
    .sort((a, b) => b.n.length - a.n.length);
  return names.find(({ n }) => t.includes(` ${n} `))?.c ?? null;
}

/** The city from a three-letter code inside a site ID, e.g. PK-SWN-FAC → Sahiwal. */
export function cityInSiteId(siteId?: string): City | null {
  if (!siteId) return null;
  const codes = siteId.toUpperCase().split(/[^A-Z]+/).filter((x) => x.length === 3);
  return CITIES.find((c) => c.codes?.some((k) => codes.includes(k))) ?? null;
}

/** Great-circle distance in kilometres. */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const bandForKm = (km: number): DistanceBand => (km <= 50 ? "<50km" : km <= 100 ? "50-100km" : ">100km");

export interface SiteDistance { city: string; centre: string; km: number; band: DistanceBand }

/**
 * Road distance (straight line × road factor) from the nearest data centre
 * to the first city found in the given texts, in the order given.
 */
export function distanceFromCentres(
  sources: { city?: string; siteId?: string; location?: string },
  centres: DataCentre[], roadFactor: number,
): SiteDistance | null {
  const city = cityInText(sources.city) ?? cityInSiteId(sources.siteId) ?? cityInText(sources.location);
  if (!city || !centres.length) return null;
  const nearest = centres
    .map((c) => ({ c, km: kmBetween(city, c) * (roadFactor > 0 ? roadFactor : 1) }))
    .sort((a, b) => a.km - b.km)[0];
  const km = Math.round(nearest.km);
  return { city: city.name, centre: nearest.c.name, km, band: bandForKm(km) };
}

/**
 * Where to draw a site on a map: its city, nudged by a small fixed offset
 * (a few km, derived from the site ID) so sites in one city don't overlap.
 * Positions are city-level, not street-level.
 */
export function placeSite(src: { city?: string; siteId?: string; location?: string }): { city: string; lat: number; lng: number } | null {
  const city = cityInText(src.city) ?? cityInSiteId(src.siteId) ?? cityInText(src.location);
  if (!city) return null;
  const key = (src.siteId ?? src.location ?? city.name).toUpperCase();
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const r = 0.02 + (((h >>> 9) % 100) / 100) * 0.03; // about 2–5 km
  return { city: city.name, lat: city.lat + r * Math.sin(angle), lng: city.lng + r * Math.cos(angle) };
}
