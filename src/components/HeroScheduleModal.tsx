import React, { useState } from 'react';
import { StoreItem, CartItem } from '../types/store';
import { STORE_CONFIG } from '../config/store.config';
import { generateNextDates, generateTimeSlots } from '../utils/dateUtils';

interface HeroScheduleModalProps {
  item: StoreItem;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSchedule: (cartItem: CartItem) => void;
}

export const HeroScheduleModal: React.FC<HeroScheduleModalProps> = ({
  item,
  isOpen,
  onClose,
  onConfirmSchedule,
}) => {
  const dates = generateNextDates(STORE_CONFIG.schedule.daysAheadAvailable);
  const timeSlots = generateTimeSlots(
    STORE_CONFIG.schedule.startHour,
    STORE_CONFIG.schedule.endHour,
    STORE_CONFIG.schedule.slotIntervalMinutes
  );

  const [selectedDate, setSelectedDate] = useState<string>(dates[0]?.value || '');
  const [selectedTime, setSelectedTime] = useState<string>(timeSlots[0] || '');
  const [selectedEmployee, setSelectedEmployee] = useState<string>(
    STORE_CONFIG.employees[0]?.name || ''
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) return;

    onConfirmSchedule({
      item,
      quantity: 1,
      selectedDate,
      selectedTime,
      employeeName: selectedEmployee,
    });
    onClose();
  };

  return (
    <div className="app-tienda-modal-backdrop" onClick={onClose}>
      <div
        className="app-tienda-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="app-tienda-modal-header">
          <div>
            <span className="app-tienda-modal-pill">Reserva Inmediata</span>
            <h2 className="app-tienda-modal-title">{item.name}</h2>
          </div>
          <button
            type="button"
            className="app-tienda-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="app-tienda-modal-body">
          <div className="app-tienda-field-group">
            <label className="app-tienda-field-label">1. Selecciona Profesional</label>
            <select
              className="app-tienda-select"
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
            >
              {STORE_CONFIG.employees.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name} ({emp.role})
                </option>
              ))}
            </select>
          </div>

          <div className="app-tienda-field-group">
            <label className="app-tienda-field-label">2. Selecciona Fecha</label>
            <div className="app-tienda-date-chips">
              {dates.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`app-tienda-date-btn ${selectedDate === d.value ? 'selected' : ''}`}
                  onClick={() => setSelectedDate(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="app-tienda-field-group">
            <label className="app-tienda-field-label">3. Horarios Disponibles</label>
            <div className="app-tienda-time-grid">
              {timeSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className={`app-tienda-time-btn ${selectedTime === slot ? 'selected' : ''}`}
                  onClick={() => setSelectedTime(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          <div className="app-tienda-modal-summary">
            <div>
              <span className="app-tienda-summary-label">Total a pagar en sucursal</span>
              <div className="app-tienda-summary-val">
                {STORE_CONFIG.currencySymbol}{item.price.toLocaleString('es-MX')} {STORE_CONFIG.currencyCode}
              </div>
            </div>
            <button type="submit" className="app-tienda-btn-confirm">
              Confirmar Reserva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
