export const HANOI_TIMEZONE = "Asia/Ho_Chi_Minh";

export function getHanoiParts(date = new Date()) {
  const hanoiDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const iso = hanoiDate.toISOString();

  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
    shortTime: iso.slice(11, 16),
  };
}

export function getHanoiNow(date = new Date()) {
  const parts = getHanoiParts(date);
  return {
    date: parts.date,
    time: parts.shortTime,
  };
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export const formatDisplayDate = formatDate;

export function buildTotalText(cards: number, balls: number) {
  return `thẻ: ${cards} | bi: ${balls} | total: ${cards} thẻ + ${balls} bi`;
}

