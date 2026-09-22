export type ItemType = 'service' | 'product';

export interface StoreItem {
  id: string;
  name: string;
  category: string;
  type: ItemType;
  price: number;
  durationMinutes?: number;
  image: string;
  description: string;
  rating?: number;
  popular?: boolean;
}

export interface CartItem {
  item: StoreItem;
  quantity: number;
  selectedDate?: string;
  selectedTime?: string;
  employeeName?: string;
}

export interface StoreConfig {
  storeName: string;
  storeTagline: string;
  logoText: string;
  currencySymbol: string;
  currencyCode: string;
  contact: {
    whatsapp: string;
    phone: string;
    email: string;
    address: string;
    instagram: string;
  };
  schedule: {
    slotIntervalMinutes: number;
    startHour: number;
    endHour: number;
    daysAheadAvailable: number;
    workingDays: number[]; // 0 = Sunday, 1 = Monday, etc.
  };
  employees: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  categories: string[];
  items: StoreItem[];
}
