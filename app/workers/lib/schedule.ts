import { CronExpressionParser } from "cron-parser";

/** Throws if `cron` is not a valid five-field expression. */
export function validateCron(cron: string, tz: string): void {
  if (cron.trim().split(/\s+/).length !== 5) throw new Error("Use a five-field cron expression");
  CronExpressionParser.parse(cron, { tz });
}

/** The first run after `from`, in the owner time zone (D31). */
export function nextRun(cron: string, tz: string, from: Date = new Date()): Date {
  return CronExpressionParser.parse(cron, { tz, currentDate: from }).next().toDate();
}
