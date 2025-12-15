import React from 'react';

export interface SidebarTabItem {
  key: string;
  label: React.ReactNode;
}

interface SidebarTabsProps {
  activeKey: string;
  items: SidebarTabItem[];
  onChange: (key: string) => void;
}

// Barra de tabs reutilizable (mismo estilo que simulación semanal)
export function SidebarTabs({ activeKey, items, onChange }: SidebarTabsProps) {
  return (
    <div className="flex border-b border-base-300 bg-base-200">
      {items.map(item => (
        <button
          key={item.key}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeKey === item.key
              ? 'border-b-2 border-primary text-primary bg-base-100'
              : 'text-base-content/60 hover:text-primary hover:bg-base-300'
          }`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}