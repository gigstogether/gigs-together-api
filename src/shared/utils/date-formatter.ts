export const msToYmd = (ms?: number): string | undefined => {
  if (!ms) return undefined;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
};
