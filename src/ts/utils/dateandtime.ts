export function secondsSinceEpoch(): number {
  // we need the time in seconds (less to store), so we cut down from milliseconds
  return Math.trunc(new Date().getTime() / 1000)
}

const dateTimeFormatOptions = {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  seconds: 'numeric',
}

function getLanguage() {
  return navigator ? navigator.language : 'en'
}

const dateTimeFormatter = Intl.DateTimeFormat(getLanguage(), dateTimeFormatOptions)

export function epochSecondsToLocaleString(seconds: number): string {
  return dateTimeFormatter.format(new Date(seconds * 1000))
}
