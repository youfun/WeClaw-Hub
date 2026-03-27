import type { ScheduledTask } from "./types.ts";

export type TaskSchedule = ScheduledTask["schedule"];

export function computeNextRun(schedule: TaskSchedule, fromMs = Date.now()): number {
  if (schedule.type === "interval") {
    const interval = schedule.interval_ms ?? 0;
    if (interval <= 0) throw new Error("invalid interval schedule");
    return fromMs + interval;
  }

  if (!schedule.cron) throw new Error("missing cron expression");
  return computeNextCronRun(schedule.cron, fromMs);
}

function computeNextCronRun(cron: string, fromMs: number): number {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("invalid cron expression");

  let candidate = new Date(fromMs);
  candidate.setUTCSeconds(0, 0);
  candidate = new Date(candidate.getTime() + 60_000);

  for (let attempts = 0; attempts < 525_600; attempts += 1) {
    if (matchesCron(fields, candidate)) {
      return candidate.getTime();
    }
    candidate = new Date(candidate.getTime() + 60_000);
  }

  throw new Error("cron schedule did not match within one year");
}

function matchesCron(fields: string[], date: Date): boolean {
  const [minuteField, hourField, domField, monthField, dowField] = fields;
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dow = date.getUTCDay();

  return (
    matchesField(minuteField!, minute, 0, 59) &&
    matchesField(hourField!, hour, 0, 23) &&
    matchesField(monthField!, month, 1, 12) &&
    matchesDayField(domField!, dowField!, day, dow)
  );
}

function matchesDayField(domField: string, dowField: string, day: number, dow: number): boolean {
  const domAny = isWildcard(domField);
  const dowAny = isWildcard(dowField);
  const domMatch = matchesField(domField, day, 1, 31);
  const dowMatch = matchesField(dowField, dow, 0, 6);

  if (domAny && dowAny) return true;
  if (domAny) return dowMatch;
  if (dowAny) return domMatch;
  return domMatch || dowMatch;
}

function matchesField(field: string, value: number, min: number, max: number): boolean {
  const parts = field.split(",");
  return parts.some((part) => matchesPart(part.trim(), value, min, max));
}

function matchesPart(part: string, value: number, min: number, max: number): boolean {
  if (part === "*") return true;

  const stepMatch = part.match(/^([^/]+)?\/(\d+)$/);
  if (stepMatch) {
    const base = stepMatch[1] ?? "*";
    const step = Number(stepMatch[2]);
    if (!Number.isInteger(step) || step <= 0) return false;
    if (base === "*") {
      return (value - min) % step === 0;
    }
    if (base.includes("-")) {
      const [rawStart, rawEnd] = base.split("-");
      const start = Number(rawStart);
      const end = Number(rawEnd);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return false;
      return value >= start && value <= end && (value - start) % step === 0;
    }
    const start = Number(base);
    if (!Number.isInteger(start)) return false;
    return value >= start && value <= max && (value - start) % step === 0;
  }

  if (part.includes("-")) {
    const [rawStart, rawEnd] = part.split("-");
    const start = Number(rawStart);
    const end = Number(rawEnd);
    return Number.isInteger(start) && Number.isInteger(end) && value >= start && value <= end;
  }

  const exact = Number(part);
  return Number.isInteger(exact) && value === exact && value >= min && value <= max;
}

function isWildcard(field: string): boolean {
  return field.trim() === "*";
}
