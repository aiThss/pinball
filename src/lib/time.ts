export const HANOI_TIMEZONE = "Asia/Ho_Chi_Minh";

export function getHanoiNow(date = new Date()) {
  const hanoiDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const iso = hanoiDate.toISOString();

  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

export function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export function buildTotalText(cards: number, balls: number) {
  return `thẻ: ${cards} | bi: ${balls} | total: ${cards} thẻ + ${balls} bi`;
}
