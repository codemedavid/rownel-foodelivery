// Time utilities for Philippine Standard Time (UTC+8)
// Used across MerchantsList, Menu, MenuItemCard, MenuItemDetailsPage, Cart, Checkout

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface MerchantOpenStatus {
  isOpen: boolean;
  nextOpenTime?: string;
  closingTime?: string;
}

export interface CategoryAvailability {
  isAvailable: boolean;
  availableAt?: string;
}

export interface MinOrderStatus {
  met: boolean;
  remaining: number;
  minimum: number;
}

// ── Core helpers ────────────────────────────────────────────────────────────

/**
 * Returns the current date/time in Philippine Standard Time (UTC+8).
 */
export function getPhilippineTime(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + PHT_OFFSET_MS);
}

/**
 * Converts "HH:MM" (24-hour) to "h:mm AM/PM" display format.
 */
export function formatTimeForDisplay(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr.padStart(2, "0");
  const period = hour >= 12 ? "PM" : "AM";

  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  return `${hour}:${minute} ${period}`;
}

// ── Internal utilities ──────────────────────────────────────────────────────

/** Converts "HH:MM" to total minutes since midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Returns lowercase day name for a PHT Date (e.g. "monday"). */
function getDayName(phtDate: Date): string {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[phtDate.getDay()];
}

/** Returns the next day name given the current day name. */
function getNextDay(day: string): string {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const idx = days.indexOf(day);
  return days[(idx + 1) % 7];
}

/**
 * Checks whether `currentMinutes` falls within a time range that may wrap
 * past midnight (e.g. "22:00-06:00").
 */
function isInTimeRange(
  currentMinutes: number,
  openMinutes: number,
  closeMinutes: number
): boolean {
  if (openMinutes <= closeMinutes) {
    // Normal range: e.g. 06:00-22:00
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }
  // Overnight range: e.g. 22:00-06:00
  return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
}

// ── Public functions ────────────────────────────────────────────────────────

/**
 * Checks whether a merchant is currently open based on their day-of-week
 * opening hours schedule.
 *
 * Schedule format: `{ "monday": "06:00-22:00", "tuesday": "closed", ... }`
 * - A missing day means the merchant is open all day (backward compat).
 * - An empty or undefined schedule means always open.
 * - The value "closed" means the merchant is closed that entire day.
 */
export function isMerchantOpen(
  openingHours?: Record<string, string>
): MerchantOpenStatus {
  // No schedule at all = always open
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { isOpen: true };
  }

  const pht = getPhilippineTime();
  const today = getDayName(pht);
  const currentMinutes = pht.getHours() * 60 + pht.getMinutes();
  const schedule = openingHours[today];

  // Day not in schedule = always open for that day
  if (schedule === undefined) {
    return { isOpen: true };
  }

  // Explicitly closed
  if (schedule.toLowerCase() === "closed") {
    const nextOpen = findNextOpenTime(openingHours, today);
    return { isOpen: false, nextOpenTime: nextOpen ?? undefined };
  }

  // Parse "HH:MM-HH:MM"
  const [openStr, closeStr] = schedule.split("-");
  const openMinutes = timeToMinutes(openStr);
  const closeMinutes = timeToMinutes(closeStr);

  if (isInTimeRange(currentMinutes, openMinutes, closeMinutes)) {
    return {
      isOpen: true,
      closingTime: formatTimeForDisplay(closeStr),
    };
  }

  // Currently outside the range
  // If we haven't reached opening time yet today (non-overnight), show today's open time
  if (openMinutes > closeMinutes) {
    // Overnight range and we're in the gap (between close and open)
    return {
      isOpen: false,
      nextOpenTime: formatTimeForDisplay(openStr),
    };
  }

  if (currentMinutes < openMinutes) {
    return {
      isOpen: false,
      nextOpenTime: formatTimeForDisplay(openStr),
    };
  }

  // Past closing time — find the next opening
  const nextOpen = findNextOpenTime(openingHours, today);
  return { isOpen: false, nextOpenTime: nextOpen ?? undefined };
}

/**
 * Scans up to 7 days ahead to find the next opening time string.
 * Returns a formatted display string or null.
 */
function findNextOpenTime(
  openingHours: Record<string, string>,
  fromDay: string
): string | null {
  let day = fromDay;

  for (let i = 0; i < 7; i++) {
    day = getNextDay(day);
    const schedule = openingHours[day];

    // Day not in schedule = always open → opens at midnight
    if (schedule === undefined) {
      return `12:00 AM (${day.charAt(0).toUpperCase() + day.slice(1)})`;
    }

    if (schedule.toLowerCase() === "closed") {
      continue;
    }

    const [openStr] = schedule.split("-");
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    return `${formatTimeForDisplay(openStr)} (${label})`;
  }

  return null;
}

/**
 * Checks whether a menu category is currently available based on an optional
 * time window (start_time / end_time in "HH:MM" format).
 *
 * - Null or undefined times mean always available.
 * - Supports overnight ranges (e.g. start=22:00, end=06:00).
 */
export function isCategoryAvailable(
  startTime?: string | null,
  endTime?: string | null
): CategoryAvailability {
  // No time constraints = always available
  if (!startTime || !endTime) {
    return { isAvailable: true };
  }

  const pht = getPhilippineTime();
  const currentMinutes = pht.getHours() * 60 + pht.getMinutes();
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (isInTimeRange(currentMinutes, startMinutes, endMinutes)) {
    return { isAvailable: true };
  }

  return {
    isAvailable: false,
    availableAt: formatTimeForDisplay(startTime),
  };
}

/**
 * Checks whether the cart subtotal meets the merchant's minimum order amount.
 */
export function getMinOrderStatus(
  minimumOrder: number,
  subtotal: number
): MinOrderStatus {
  return {
    met: subtotal >= minimumOrder,
    remaining: Math.max(0, minimumOrder - subtotal),
    minimum: minimumOrder,
  };
}
