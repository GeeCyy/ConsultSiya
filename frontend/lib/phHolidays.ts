export type PhHoliday = {
  date: string; // YYYY-MM-DD
  name: string;
};

const cache = new Map<number, PhHoliday[]>();

export async function fetchPhHolidays(year: number): Promise<PhHoliday[]> {
  if (cache.has(year)) return cache.get(year)!;

  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`);
    if (!res.ok) return [];
    const data: Array<{ date: string; name: string; localName: string }> = await res.json();
    const holidays = data.map(h => ({ date: h.date, name: h.name }));
    cache.set(year, holidays);
    return holidays;
  } catch {
    return [];
  }
}
