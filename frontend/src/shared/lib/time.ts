export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}
