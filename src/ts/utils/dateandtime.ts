import { DateTime } from 'luxon'

export function secondsSinceEpoch(): number {
  return Math.trunc(DateTime.local().toSeconds())
}

export function epochSecondsToLocaleString(seconds: number): string {
  return DateTime.fromSeconds(seconds).toLocaleString(DateTime.DATETIME_MED)
}
