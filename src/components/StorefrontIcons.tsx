import type { SVGProps } from 'react';

type IconName = 'clock' | 'pin' | 'phone' | 'search' | 'plus' | 'check' | 'chevron' | 'close' | 'calendar' | 'service' | 'copy' | 'link';
const paths: Record<IconName, React.ReactNode> = {
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>,
  link: <><path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1" transform="translate(1 -1)" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  phone: <path d="m8 3 2 5-3 2c2 4 3 5 7 7l2-3 5 2c0 4-2 5-4 5C10 21 3 14 3 7c0-2 1-4 5-4Z" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-11 5h2m3 0h2" /></>,
  service: <><path d="M5 7h14v13H5zM9 7V5a3 3 0 0 1 6 0v2" /><path d="m9 13 2 2 4-4" /></>,
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
