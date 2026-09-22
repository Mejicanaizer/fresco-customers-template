import React from 'react';
import { ItemType } from '../types/store';

interface HeroTypeDropdownProps {
  selectedType: ItemType | 'all';
  onSelectType: (type: ItemType | 'all') => void;
  serviceCount: number;
  productCount: number;
}

export const HeroTypeDropdown: React.FC<HeroTypeDropdownProps> = ({
  selectedType,
  onSelectType,
  serviceCount,
  productCount,
}) => {
  return (
    <div className="app-tienda-type-switch">
      <button
        type="button"
        className={`app-tienda-type-btn ${selectedType === 'all' ? 'active' : ''}`}
        onClick={() => onSelectType('all')}
      >
        Todo el catálogo ({serviceCount + productCount})
      </button>
      <button
        type="button"
        className={`app-tienda-type-btn ${selectedType === 'service' ? 'active' : ''}`}
        onClick={() => onSelectType('service')}
      >
        Servicios en Salón ({serviceCount})
      </button>
      <button
        type="button"
        className={`app-tienda-type-btn ${selectedType === 'product' ? 'active' : ''}`}
        onClick={() => onSelectType('product')}
      >
        Productos & Retail ({productCount})
      </button>
    </div>
  );
};
