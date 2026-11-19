/** An instant as `YYYY-MM-DD HH:MM UTC`, the same for every viewer; empty when missing. */
export function utcMinute(instant: string | null | undefined): string {
  if (!instant) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
