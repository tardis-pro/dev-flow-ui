import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow } from "date-fns";

export function cn(...inputs: Array<string | undefined | null | boolean>) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date) {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "";
  }
}

export function safeParseInt(value: string | string[] | undefined) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number.parseInt(raw, 10);
  return Number.isNaN(num) ? null : num;
}
