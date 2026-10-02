import { CLUB } from "@/config/club";

/** Build a tiny .ics so players can add the match to their calendar. */
export function downloadIcs(match: {
  id: number;
  startTime: string;
  endTime: string;
  terrainName?: string | null;
}) {
  const f = (d: string) =>
    new Date(d)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${CLUB.name}//FR`,
    "BEGIN:VEVENT",
    `UID:reservation-${match.id}@${window.location.hostname}`,
    `DTSTAMP:${f(new Date().toISOString())}`,
    `DTSTART:${f(match.startTime)}`,
    `DTEND:${f(match.endTime)}`,
    `SUMMARY:Padel · ${match.terrainName ?? ""}`,
    `LOCATION:${[CLUB.name, CLUB.fullAddress].filter(Boolean).join(", ")}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Padel",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `padel-${match.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
