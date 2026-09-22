export interface DateOption {
  value: string;
  label: string;
  isToday: boolean;
}

export function generateNextDates(daysCount: number = 14): DateOption[] {
  const dates: DateOption[] = [];
  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const now = new Date();

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);

    const dayName = daysOfWeek[d.getDay()];
    const dayNum = d.getDate();
    const monthName = months[d.getMonth()];
    const isoDate = d.toISOString().split('T')[0];

    const label = i === 0 
      ? `Hoy, ${dayNum} de ${monthName}` 
      : i === 1 
        ? `Mañana, ${dayNum} de ${monthName}` 
        : `${dayName} ${dayNum} de ${monthName}`;

    dates.push({
      value: isoDate,
      label,
      isToday: i === 0,
    });
  }

  return dates;
}

export function generateTimeSlots(
  startHour: number = 9, 
  endHour: number = 20, 
  intervalMinutes: number = 30
): string[] {
  const slots: string[] = [];

  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += intervalMinutes) {
      const hStr = hour.toString().padStart(2, '0');
      const mStr = min.toString().padStart(2, '0');
      slots.push(`${hStr}:${mStr}`);
    }
  }

  return slots;
}
