import React, { useState, useEffect, useCallback } from 'react';
import {
  BarcodeScanQuantityMode,
  BARCODE_SCAN_MODE_LABELS,
  UiPrefs,
  UI_PREFS_EVENT,
  UI_PREFS_STORAGE_KEY,
  readUiPrefs,
  writeUiPrefs
} from '../utils/uiScale';

/**
 * خطاف مشترك لقراءة وتحديث طريقة إضافة الكمية عند مسح الباركود على هذا الجهاز (عبر UiPrefs و localStorage).
 * يتزامن تلقائيًا بين شاشات المعاملات الخمس (البيع، المشتريات، مرتجع المبيعات، مرتجع المشتريات، التحويل بين المخازن).
 */
export function useBarcodeScanMode(): [
  BarcodeScanQuantityMode,
  (nextMode: BarcodeScanQuantityMode) => void
] {
  const [mode, setModeState] = useState<BarcodeScanQuantityMode>(() => readUiPrefs().barcodeScanMode);

  useEffect(() => {
    const handlePrefsUpdate = (e: Event) => {
      const custom = e as CustomEvent<UiPrefs>;
      const prefs = custom.detail ? custom.detail : readUiPrefs();
      setModeState(prefs.barcodeScanMode);
    };
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === UI_PREFS_STORAGE_KEY) {
        setModeState(readUiPrefs().barcodeScanMode);
      }
    };
    window.addEventListener(UI_PREFS_EVENT, handlePrefsUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(UI_PREFS_EVENT, handlePrefsUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setMode = useCallback((nextMode: BarcodeScanQuantityMode) => {
    const updated = writeUiPrefs({ barcodeScanMode: nextMode });
    setModeState(updated.barcodeScanMode);
  }, []);

  return [mode, setMode];
}

interface BarcodeScanModeSelectProps {
  value?: BarcodeScanQuantityMode;
  onChange?: (mode: BarcodeScanQuantityMode) => void;
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
}

export const BarcodeScanModeSelect: React.FC<BarcodeScanModeSelectProps> = ({
  value,
  onChange,
  showLabel = true,
  compact = false,
  className = ''
}) => {
  const [sharedMode, setSharedMode] = useBarcodeScanMode();
  const activeMode = value ?? sharedMode;
  const handleSelect = (nextMode: BarcodeScanQuantityMode) => {
    if (onChange) {
      onChange(nextMode);
    } else {
      setSharedMode(nextMode);
    }
  };

  return (
    <div className={className} data-testid="barcode-scan-mode-selector">
      {showLabel && (
        <label className="block text-[11px] font-bold text-[var(--text-secondary,theme(colors.slate.600))] mb-1">
          طريقة إضافة الكمية بالباركود
        </label>
      )}
      <div
        role="group"
        aria-label="طريقة إضافة الكمية عند مسح الباركود"
        className={`inline-grid grid-cols-2 gap-1 p-0.5 rounded-lg border border-slate-300 bg-slate-100 ${
          compact ? 'w-full' : 'min-h-[44px]'
        }`}
      >
        <button
          type="button"
          data-testid="barcode-scan-mode-edit"
          aria-pressed={activeMode === 'edit_quantity'}
          onClick={() => handleSelect('edit_quantity')}
          title="يضيف الصنف أول مرة بكمية 1، وعند مسحه مرة أخرى يحدد سطره الموجود لتعديل الكمية يدويًا دون زيادة تلقائية"
          className={`${
            compact ? 'min-h-[34px] px-2 py-1 text-[11px]' : 'min-h-[38px] px-2.5 py-1 text-xs'
          } rounded-md font-bold transition cursor-pointer whitespace-nowrap text-center ${
            activeMode === 'edit_quantity'
              ? 'bg-[#1668B2] text-white shadow-2xs'
              : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
          }`}
        >
          {BARCODE_SCAN_MODE_LABELS.edit_quantity}
        </button>

        <button
          type="button"
          data-testid="barcode-scan-mode-increment"
          aria-pressed={activeMode === 'increment'}
          onClick={() => handleSelect('increment')}
          title="يضيف الصنف بكمية 1، وكل مسح جديد ناجح لنفس الصنف يزيد الكمية بمقدار 1 بدل إنشاء سطر مكرر"
          className={`${
            compact ? 'min-h-[34px] px-2 py-1 text-[11px]' : 'min-h-[38px] px-2.5 py-1 text-xs'
          } rounded-md font-bold transition cursor-pointer whitespace-nowrap text-center ${
            activeMode === 'increment'
              ? 'bg-[#1668B2] text-white shadow-2xs'
              : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
          }`}
        >
          {BARCODE_SCAN_MODE_LABELS.increment}
        </button>
      </div>
    </div>
  );
};
