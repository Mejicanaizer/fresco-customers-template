import React from 'react';

interface HeroCategoriesBarProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  categoryCounts: Record<string, number>;
}

export const HeroCategoriesBar: React.FC<HeroCategoriesBarProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
}) => {
  return (
    <div className="app-tienda-categories-wrapper">
      <div className="app-tienda-categories-bar">
        {categories.map((cat) => {
          const count = categoryCounts[cat] || 0;
          return (
            <button
              key={cat}
              type="button"
              className={`app-tienda-cat-chip ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => onSelectCategory(cat)}
            >
              <span>{cat}</span>
              {count > 0 && <span className="app-tienda-cat-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
