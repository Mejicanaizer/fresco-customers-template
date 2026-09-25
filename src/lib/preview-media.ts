/// <reference types="vite/client" />
import type { Storefront } from './contracts';

/** Explicit local design preview. Production and owner records always use published media. */
export async function applyPreviewMedia(site: Storefront): Promise<{ site: Storefront; illustrativeMedia: boolean }> {
  if (!import.meta.env.DEV || import.meta.env.VITE_STOREFRONT_PREVIEW_MEDIA !== 'grooming' || !site.capabilities.grooming) return { site, illustrativeMedia: false };
  const needsCover = !site.coverImageUrl, needsServices = site.services.some(service => !service.imageUrl);
  if (!needsCover && !needsServices) return { site, illustrativeMedia: false };
  // Vite serves these source URLs only in development; no preview assets enter dist.
  const cover = '/src/assets/preview/grooming-cover.png';
  const servicePhoto = '/src/assets/preview/grooming-service.png';
  return { illustrativeMedia: true, site: { ...site, coverImageUrl: site.coverImageUrl || cover, services: site.services.map(service => ({ ...service, imageUrl: service.imageUrl || servicePhoto })) } };
}
