import React, { useState, useMemo } from 'react';
import { STORE_CONFIG } from './config/store.config';
import { ItemType, StoreItem, CartItem } from './types/store';
import { StoreNavbar } from './components/StoreNavbar';
import { HeroBanner } from './components/HeroBanner';
import { HeroTypeDropdown } from './components/HeroTypeDropdown';
import { HeroCategoriesBar } from './components/HeroCategoriesBar';
import { HeroProductCard } from './components/HeroProductCard';
import { HeroScheduleModal } from './components/HeroScheduleModal';
import { HeroFloatingCart } from './components/HeroFloatingCart';
import { HeroCheckoutPanel } from './components/HeroCheckoutPanel';
import { StoreFooter } from './components/StoreFooter';
import './styles/store.css';

export const App: React.FC = () => {
  const [selectedType, setSelectedType] = useState<ItemType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [activeScheduleItem, setActiveScheduleItem] = useState<StoreItem | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);

  const serviceCount = useMemo(
    () => STORE_CONFIG.items.filter((i) => i.type === 'service').length,
    []
  );

  const productCount = useMemo(
    () => STORE_CONFIG.items.filter((i) => i.type === 'product').length,
    []
  );

  const filteredItems = useMemo(() => {
    return STORE_CONFIG.items.filter((item) => {
      const matchType = selectedType === 'all' || item.type === selectedType;
      const matchCat = selectedCategory === 'Todos' || item.category === selectedCategory;
      return matchType && matchCat;
    });
  }, [selectedType, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: 0 };
    STORE_CONFIG.items.forEach((item) => {
      if (selectedType === 'all' || item.type === selectedType) {
        counts['Todos'] = (counts['Todos'] || 0) + 1;
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
    });
    return counts;
  }, [selectedType]);

  const handleCardAction = (item: StoreItem) => {
    if (item.type === 'service') {
      setActiveScheduleItem(item);
    } else {
      setCartItems((prev) => {
        const existingIdx = prev.findIndex((ci) => ci.item.id === item.id);
        if (existingIdx > -1) {
          const next = [...prev];
          next[existingIdx].quantity += 1;
          return next;
        }
        return [...prev, { item, quantity: 1 }];
      });
    }
  };

  const handleConfirmSchedule = (scheduledItem: CartItem) => {
    setCartItems((prev) => [...prev, scheduledItem]);
  };

  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const totalCartCount = cartItems.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="app-tienda-page">
      <StoreNavbar
        cartCount={totalCartCount}
        onOpenCart={() => setIsCheckoutOpen(true)}
      />

      <HeroBanner />

      <main className="app-tienda-main">
        <HeroTypeDropdown
          selectedType={selectedType}
          onSelectType={setSelectedType}
          serviceCount={serviceCount}
          productCount={productCount}
        />

        <HeroCategoriesBar
          categories={STORE_CONFIG.categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          categoryCounts={categoryCounts}
        />

        <div className="app-tienda-grid">
          {filteredItems.map((item) => (
            <HeroProductCard
              key={item.id}
              item={item}
              onAction={handleCardAction}
            />
          ))}
        </div>
      </main>

      <StoreFooter />

      {activeScheduleItem && (
        <HeroScheduleModal
          item={activeScheduleItem}
          isOpen={Boolean(activeScheduleItem)}
          onClose={() => setActiveScheduleItem(null)}
          onConfirmSchedule={handleConfirmSchedule}
        />
      )}

      <HeroFloatingCart
        cartItems={cartItems}
        onOpenCheckout={() => setIsCheckoutOpen(true)}
      />

      <HeroCheckoutPanel
        isOpen={isCheckoutOpen}
        cartItems={cartItems}
        onClose={() => setIsCheckoutOpen(false)}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />
    </div>
  );
};

export default App;
