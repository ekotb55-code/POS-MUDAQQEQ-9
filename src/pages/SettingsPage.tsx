import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  SystemConfig,
  UserAccount,
  UserRole,
  CompanySettings,
  ContactSettings,
  InvoicePrintSettings,
  DisplaySettings,
  TaxSettings,
  StockSettings,
  Cashbox,
  AppTheme,
  MotionMode,
  Customer,
  Platform,
  Invoice,
  isValidAppTheme,
  KeyboardShortcutActionId,
  KeyboardShortcutsSettings,
  SalesRules,
  DefaultSaleMode,
  DefaultSelectionMode,
  DefaultCustomerSelectionMode,
  VisitorDisplaySettings,
  VisitorSlide,
  ImagesStorageStatus,
  ImagesMigrationResult,
  Item,
  InvoiceNumberingSettings
} from '../types';
import {
  LabelSettings,
  LabelElement,
  LabelElementKey,
  LabelAlign,
  BarcodeType,
  LabelItem,
  LabelLine,
  defaultLabelSettings,
  normalizeLabelSettings,
  validateLabelSettings,
  buildLabelPrintHtml,
  itemBarcodeList,
  defaultBarcodeFor,
  LABEL_ELEMENT_LABELS,
  LABEL_SIZE_PRESETS
} from '../utils/labelPrint';
import { printHtmlInHiddenIframe } from './LabelPrintPage';
import {
  api,
  setAuthToken,
  DatabaseStatusResponse,
  DatabaseCheckResult,
  BackupMetaInfo,
  BackupSummaryInfo
} from '../api/client';
import { hasPermission } from '../utils/permissions';
import {
  readUiPrefs,
  writeUiPrefs,
  applyUiPrefs,
  DEFAULT_UI_PREFS,
  UI_SCALE_OPTIONS,
  formatScale,
  POS_PANEL_WIDTH_LABELS,
  POS_SIZE_LABELS,
  UI_PREFS_EVENT,
  UI_PREFS_STORAGE_KEY,
  UiPrefs,
  PosPanelWidth,
  PosSize
} from '../utils/uiScale';
import {
  KEYBOARD_SHORTCUT_GROUPS,
  KEYBOARD_SHORTCUT_DEFINITIONS,
  SHORTCUT_DEFINITION_MAP,
  getDefaultKeyboardShortcutsSettings,
  resolveKeyboardShortcutsSettings,
  formatKeyboardEventToKey,
  validateShortcutKeyAssignment
} from '../utils/keyboardShortcuts';
import { useKeyboardShortcuts, ShortcutBadge } from '../context/KeyboardShortcutsContext';
import { UserModal } from '../components/UserModal';
import { ReceiptPrintArea } from '../components/ReceiptPrintArea';
import { SystemResetSection } from '../components/settings/SystemResetSection';
import { BankLinkSection } from '../components/settings/BankLinkSection';
import {
  selectBackupDirectory,
  getBackupDirectoryStatus,
  activateBackupDirectoryPermission,
  getBackupJsonlFileName,
  clearLocalApplicationDataSafely,
  checkStorageQuotaStatus,
  BackupDirectoryStatus,
  StorageQuotaStatus
} from '../offline/db';
import {
  Database,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Check,
  Save,
  UserPlus,
  Edit3,
  Power,
  Sparkles,
  Trash2,
  FolderOpen,
  Upload,
  Download,
  Copy,
  ExternalLink,
  XCircle,
  RotateCcw,
  Keyboard,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Printer
} from 'lucide-react';
import {
  PageSurface,
  SectionHeading,
  CompactTable,
  ModalShell,
  COMPACT_TABLE_NUM_CLASS,
  COMPACT_TABLE_TEXT_CLASS,
  INPUT_WIDTH_CLASSES,
  FORM_CONTROL_BASE_CLASS
} from '../components/ui';

export type SettingsTab =
  | 'company'
  | 'appearance'
  | 'sales'
  | 'visitor'
  | 'stock'
  | 'print'
  | 'labels'
  | 'tax'
  | 'users'
  | 'integration'
  | 'backup'
  | 'display'
  | 'ui_scale'
  | 'bank_link'
  | 'shortcuts';

type CanonicalSettingsTab =
  | 'company'
  | 'appearance'
  | 'sales'
  | 'visitor'
  | 'stock'
  | 'print'
  | 'labels'
  | 'tax'
  | 'users'
  | 'integration'
  | 'bank_link'
  | 'shortcuts';

function normalizeSettingsTab(tab?: SettingsTab): CanonicalSettingsTab {
  if (!tab || tab === 'company') return 'company';
  if (tab === 'backup') return 'integration';
  if (tab === 'display') return 'sales';
  if (tab === 'ui_scale') return 'appearance';
  return tab;
}

export interface ThemeDefinition {
  id: AppTheme;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  badgeAr: string;
  descriptionAr: string;
  palette: {
    appBg: string;
    surface: string;
    header: string;
    sidebar: string;
    primary: string;
    primaryOnWhite?: string;
    brandGradient?: string;
    success: string;
    warning: string;
    danger: string;
    text: string;
    textSecondary: string;
    border: string;
  };
  swatches: { name: string; hex: string }[];
}

export const THEME_OPTIONS: ThemeDefinition[] = [
  {
    id: 'light-sky',
    nameAr: 'فاتح سماوي (مطابق للمرجع)',
    nameEn: 'Light Sky (Reference)',
    taglineAr: 'الهوية الموصى بها والافتراضية للمستخدمين الجدد',
    badgeAr: 'الموصى به / الافتراضي',
    descriptionAr: 'درجات مطابقة تماماً للمرجع البصري: رأس أزرق سماوي (#568FBE)، قائمة جانبية بيضاء، عنصر محدد (#E9F5FB) مع مؤشر سماوي (#55BCD3)، وأزرار ملونة وظيفياً.',
    palette: {
      appBg: '#F6F8FA',
      surface: '#FFFFFF',
      header: '#568FBE',
      sidebar: '#FFFFFF',
      primary: '#55BCD3',
      success: '#57B65E',
      warning: '#F2A343',
      danger: '#D9524F',
      text: '#263E50',
      textSecondary: '#718797',
      border: '#E3E9ED'
    },
    swatches: [
      { name: 'خلفية التطبيق', hex: '#F6F8FA' },
      { name: 'الأسطح والبطاقات', hex: '#FFFFFF' },
      { name: 'رأس التطبيق', hex: '#568FBE' },
      { name: 'الشريط الجانبي', hex: '#FFFFFF' },
      { name: 'العنصر المحدد', hex: '#E9F5FB' },
      { name: 'الأزرار السماوية', hex: '#55BCD3' },
      { name: 'الإضافة والحفظ (نجاح)', hex: '#57B65E' },
      { name: 'التنبيهات (تحذير)', hex: '#F2A343' },
      { name: 'الإلغاء (خطأ)', hex: '#D9524F' },
      { name: 'النص الأساسي', hex: '#263E50' },
      { name: 'النص الثانوي', hex: '#718797' },
      { name: 'الحدود والفواصل', hex: '#E3E9ED' }
    ]
  },
  {
    id: 'dark',
    nameAr: 'داكن مريح للعين',
    nameEn: 'Comfortable Dark Mode',
    taglineAr: 'بيئة ليلية أنيقة وعالية الوضوح والتباين',
    badgeAr: 'ليلي مريح',
    descriptionAr: 'تصميم داكن متكامل بدرجات مشتقة ومتناسقة: خلفية #101B29، رأس #16283A، شريط جانبي #152536، بطاقات #1B2D40، وسماوي مضيء #63C4EB.',
    palette: {
      appBg: '#101B29',
      surface: '#1B2D40',
      header: '#16283A',
      sidebar: '#152536',
      primary: '#63C4EB',
      success: '#6FD4AC',
      warning: '#F0B45E',
      danger: '#F08080',
      text: '#EFF7FB',
      textSecondary: '#A8BFCE',
      border: '#2A4054'
    },
    swatches: [
      { name: 'خلفية التطبيق', hex: '#101B29' },
      { name: 'رأس التطبيق', hex: '#16283A' },
      { name: 'الشريط الجانبي', hex: '#152536' },
      { name: 'البطاقات والنوافذ', hex: '#1B2D40' },
      { name: 'الأسطح الداخلية', hex: '#203448' },
      { name: 'السماوي الأساسي', hex: '#63C4EB' },
      { name: 'أزرار ثانوية', hex: '#55BCD3' },
      { name: 'النجاح والحفظ', hex: '#6FD4AC' },
      { name: 'التحذير والتنبيه', hex: '#F0B45E' },
      { name: 'الخطأ والإلغاء', hex: '#F08080' },
      { name: 'النص الأساسي', hex: '#EFF7FB' },
      { name: 'النص الثانوي', hex: '#A8BFCE' },
      { name: 'الحدود والفواصل', hex: '#2A4054' }
    ]
  },
  {
    id: 'current',
    nameAr: 'المظهر الحالي (كحلي وسماوي أصلي)',
    nameEn: 'Current Classic Navy',
    taglineAr: 'المظهر الأصلي المألوف للنظام',
    badgeAr: 'المظهر الأصلي',
    descriptionAr: 'احتفاظ بالمظهر الكلاسيكي الأصلي للتطبيق بالكامل: رأس وشريط جانبي كحلي عميق (#164E72)، لمسات سماوية (#42BDE5)، وخلفية فاتحة كلاسيكية (#F4F9FD).',
    palette: {
      appBg: '#F4F9FD',
      surface: '#FFFFFF',
      header: '#164E72',
      sidebar: '#164E72',
      primary: '#1678C2',
      success: '#168A78',
      warning: '#E8A83E',
      danger: '#D6535B',
      text: '#263746',
      textSecondary: '#718293',
      border: '#D9E8F3'
    },
    swatches: [
      { name: 'خلفية التطبيق', hex: '#F4F9FD' },
      { name: 'الأسطح والبطاقات', hex: '#FFFFFF' },
      { name: 'رأس التطبيق', hex: '#164E72' },
      { name: 'الشريط الجانبي', hex: '#164E72' },
      { name: 'اللون الأساسي', hex: '#1678C2' },
      { name: 'السماوي اللامع', hex: '#42BDE5' },
      { name: 'النجاح والحفظ', hex: '#168A78' },
      { name: 'التنبيه والتحذير', hex: '#E8A83E' },
      { name: 'الخطأ والإلغاء', hex: '#D6535B' },
      { name: 'النص الأساسي', hex: '#263746' },
      { name: 'النص الثانوي', hex: '#718293' },
      { name: 'الحدود والفواصل', hex: '#D9E8F3' }
    ]
  },
  {
    id: 'aurora',
    nameAr: 'أورورا',
    nameEn: '',
    taglineAr: 'تدرج بنفسجي ووردي معاصر مع بطاقات بيضاء صافية',
    badgeAr: 'جديد • أورورا',
    descriptionAr: 'مظهر عصري متوازن بخلفية بنفسجية ناعمة (#F1EFFB)، لون أساسي (#6D28D9)، تدرج علامة أنيق، ونص أساسي عالي الوضوح (#17153B).',
    palette: {
      appBg: '#F1EFFB',
      surface: '#FFFFFF',
      header: '#4338CA',
      sidebar: '#FFFFFF',
      primary: '#6D28D9',
      primaryOnWhite: '#4338CA',
      brandGradient: 'linear-gradient(118deg, #4338CA 0%, #7C3AED 46%, #DB2777 100%)',
      success: '#15803D',
      warning: '#B45309',
      danger: '#B42318',
      text: '#17153B',
      textSecondary: '#5E5A80',
      border: 'rgba(23,21,59,0.08)'
    },
    swatches: [
      { name: 'خلفية الصفحة', hex: '#F1EFFB' },
      { name: 'البطاقات والأسطح', hex: '#FFFFFF' },
      { name: 'اللون الأساسي', hex: '#6D28D9' },
      { name: 'النص الأساسي على الأبيض', hex: '#4338CA' },
      { name: 'الوردي في تدرج العلامة', hex: '#DB2777' },
      { name: 'الصافي والحفظ', hex: '#15803D' },
      { name: 'الرسوم والتنبيه', hex: '#B45309' },
      { name: 'الخصم والإلغاء', hex: '#B42318' },
      { name: 'وسط تدرج العلامة', hex: '#7C3AED' },
      { name: 'النص الأساسي', hex: '#17153B' },
      { name: 'النص الثانوي', hex: '#5E5A80' }
    ]
  },
  {
    id: 'aurora-sky',
    nameAr: 'أورورا السماوي',
    nameEn: '',
    taglineAr: 'تدرج سماوي مشرق بصفاء بصري وأزرار واضحة',
    badgeAr: 'جديد • سماوي',
    descriptionAr: 'تصميم مشرق بخلفية سماوية هادئة (#EEF5FD)، لون أساسي أزرق (#0A5FC2)، تدرج علامة سماوي حيوي، وبطاقات بيضاء بوضوح عالٍ.',
    palette: {
      appBg: '#EEF5FD',
      surface: '#FFFFFF',
      header: '#0A5FC2',
      sidebar: '#FFFFFF',
      primary: '#0A5FC2',
      primaryOnWhite: '#0A5FC2',
      brandGradient: 'linear-gradient(118deg, #0A5FC2 0%, #1687E0 50%, #35C1F1 100%)',
      success: '#15803D',
      warning: '#B45309',
      danger: '#B42318',
      text: '#0F2540',
      textSecondary: '#55667E',
      border: 'rgba(15,37,64,0.08)'
    },
    swatches: [
      { name: 'خلفية الصفحة', hex: '#EEF5FD' },
      { name: 'البطاقات والأسطح', hex: '#FFFFFF' },
      { name: 'اللون الأساسي', hex: '#0A5FC2' },
      { name: 'أزرق وسط التدرج', hex: '#1687E0' },
      { name: 'سماوي التدرج المشرق', hex: '#35C1F1' },
      { name: 'الصافي والحفظ', hex: '#15803D' },
      { name: 'الرسوم والتنبيه', hex: '#B45309' },
      { name: 'الخصم والإلغاء', hex: '#B42318' },
      { name: 'النص الأساسي', hex: '#0F2540' },
      { name: 'النص الثانوي', hex: '#55667E' }
    ]
  }
];

async function resizeHeaderImage(
  file: File,
  maxWidth = 576,
  maxHeight = 300,
  maxSizeBytes = 300 * 1024
): Promise<{ base64: string; mimeType: string; fileName: string; sizeKb: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('الملف المحدد ليس صورة صالحة (PNG أو JPEG)'));
    }

    if (file.size > 15 * 1024 * 1024) {
      return reject(new Error('حجم الصورة كبير جداً (أقصى حد 15 ميجابايت)'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشلت قراءة ملف الصورة'));
    reader.onload = (e) => {
      const img = new (window as any).Image();
      img.onerror = () => reject(new Error('فشل معالجة بيانات الصورة'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('تعذر معالجة أبعاد الصورة'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        const isPng = file.type === 'image/png';
        let mimeType = isPng ? 'image/png' : 'image/jpeg';
        const quality = 0.85;
        let base64 = canvas.toDataURL(mimeType, quality);
        let approxBytes = (base64.length * 3) / 4;

        if (approxBytes > maxSizeBytes && isPng) {
          mimeType = 'image/jpeg';
          base64 = canvas.toDataURL(mimeType, 0.82);
          approxBytes = (base64.length * 3) / 4;
        }

        const sizeKb = Math.round(approxBytes / 1024);
        resolve({
          base64,
          mimeType,
          fileName: `header_${Date.now()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
          sizeKb
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

async function resizeVisitorSlideImage(
  file: File,
  maxWidth = 1920
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('الملف المحدد ليس صورة صالحة'));
    }
    if (file.size > 20 * 1024 * 1024) {
      return reject(new Error('حجم الصورة كبير جدًا (أقصى حد 20 ميجابايت)'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشلت قراءة ملف الصورة'));
    reader.onload = (e) => {
      const img = new (window as any).Image();
      img.onerror = () => reject(new Error('فشل معالجة بيانات الصورة'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('تعذر معالجة أبعاد الصورة'));
        }
        // Fill white background before drawing JPEG so transparent PNGs don't turn black
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(base64);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function getFontStackCss(font?: string): string {
  if (font === 'Cairo') return "'Cairo', 'Tajawal', Arial, sans-serif";
  if (font === 'sans-serif') return "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  return "'Tajawal', 'Cairo', Arial, sans-serif";
}

function applyFontPreview(font?: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--app-font-family', getFontStackCss(font));
}

const DEMO_CUSTOMER: Customer = {
  id: 'cust-demo-1',
  name: 'شركة النور للتجارة والتوريدات',
  phone: '01012345678',
  address: '15 شارع الثورة، مصر الجديدة، القاهرة',
  openingBalance: 0,
  currentBalance: 1250.00,
  status: 'active',
  createdAt: '2025-01-01T00:00:00.000Z'
};

const DEMO_INVOICE: Invoice = {
  invoiceNumber: 'INV-2025-00142',
  date: new Date().toISOString(),
  platform: 'البيع المباشر',
  platformId: 'direct',
  platformName: 'البيع المباشر',
  paymentType: 'نقدي',
  status: 'تم البيع',
  totalBeforeDiscount: 1895.00,
  discountAmount: 140.00,
  pickupFeeAmount: 0,
  deliveryFee: 0,
  taxAmount: 215.35,
  netAmount: 1755.00,
  paidAmount: 1800.00,
  remainingAmount: 0,
  cashierName: 'أحمد الكاشير',
  createdBy: 'أحمد الكاشير',
  customerName: 'شركة النور للتجارة والتوريدات',
  customerId: 'cust-demo-1',
  notes: 'تسليم في مقر الشركة - معتمد من الإدارة',
  lines: [
    {
      invoiceNumber: 'INV-2025-00142',
      itemId: 'it-1',
      itemNameAtSale: 'شاحن أنكر 65W سريع ثلاثي المنافذ [ANK-65-BLK]',
      itemPrintNameAtSale: 'شاحن أنكر 65W سريع ثلاثي المنافذ',
      barcodeAtSale: '6221234567890',
      quantity: 2,
      salePriceAtSale: 850.00,
      taxRateAtSale: 14,
      unitTaxAmount: 104.38,
      platformDiscountPercentAtSale: 0,
      unitDiscountValue: 0,
      unitPickupFee: 0,
      totalPickupFee: 0,
      unitNet: 850.00
    },
    {
      invoiceNumber: 'INV-2025-00142',
      itemId: 'it-2',
      itemNameAtSale: 'كابل تايب سي نايلون مضفر 1.8 متر',
      barcodeAtSale: '6229876543210',
      quantity: 1,
      salePriceAtSale: 195.00,
      taxRateAtSale: 14,
      unitTaxAmount: 23.95,
      platformDiscountPercentAtSale: 0,
      unitDiscountValue: 0,
      unitPickupFee: 0,
      totalPickupFee: 0,
      unitNet: 195.00
    }
  ]
};

interface SettingsPageProps {
  config: SystemConfig;
  items?: Item[];
  users: UserAccount[];
  currentUser: UserAccount;
  onSaveUser: (userData: any) => Promise<any>;
  onSyncAll: () => Promise<void>;
  onLogout?: () => void;
  onForceLogoutAfterReset?: () => void;
  initialTab?: SettingsTab;
  appTheme?: AppTheme;
  onChangeTheme?: (theme: AppTheme) => void;
  motionMode?: MotionMode;
  onChangeMotion?: (mode: MotionMode) => void;
  onUpdateKeyboardShortcuts?: (shortcuts: KeyboardShortcutsSettings) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterRevert?: (fn: () => void) => void;
}

const DEFAULT_SALES_RULES: SalesRules = {
  defaultSaleMode: 'last',
  platformSelection: 'first',
  defaultPlatformId: '',
  customerSelection: 'none',
  defaultCustomerId: '',
  allowZeroPriceSale: true,
  allowBelowCostSale: true,
  platformAlwaysCredit: false,
  updatedAt: '',
  updatedBy: '',
  effectivePlatformSelection: 'first',
  effectiveCustomerSelection: 'none',
  defaultPlatformMissing: false,
  defaultCustomerMissing: false
};

const DEFAULT_INVOICE_NUMBERING_SETTINGS: InvoiceNumberingSettings = {
  prefix: 'INV-',
  datePart: 'day',
  separator: '-',
  digits: 4,
  suffix: '',
  resetPeriod: 'daily',
  startAt: 1,
  platformOrderDuplicates: 'block',
  updatedAt: '',
  updatedBy: ''
};

const INVOICE_DATE_RANK: Record<InvoiceNumberingSettings['datePart'], number> = {
  none: 0,
  year: 1,
  month: 2,
  day: 3
};

const INVOICE_RESET_NEEDS: Record<InvoiceNumberingSettings['resetPeriod'], number> = {
  never: 0,
  yearly: 1,
  monthly: 2,
  weekly: 3,
  daily: 3
};

function formatLiveInvoiceNumberExample(s: InvoiceNumberingSettings): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const yyyy = get('year') || String(new Date().getFullYear());
  const mm = get('month') || String(new Date().getMonth() + 1).padStart(2, '0');
  const dd = get('day') || String(new Date().getDate()).padStart(2, '0');
  const dateToken =
    s.datePart === 'year'
      ? yyyy
      : s.datePart === 'month'
      ? `${yyyy}${mm}`
      : s.datePart === 'day'
      ? `${yyyy}${mm}${dd}`
      : '';
  const sep = dateToken ? s.separator : '';
  const digits = Math.min(8, Math.max(1, Math.round(Number(s.digits) || 4)));
  const startVal = Math.max(1, Math.round(Number(s.startAt) || 1));
  const seqToken = String(startVal).padStart(digits, '0');
  return `${s.prefix || ''}${dateToken}${sep}${seqToken}${s.suffix || ''}`;
}

const DEFAULT_VISITOR_DISPLAY_SETTINGS: VisitorDisplaySettings = {
  slideSeconds: 8,
  resultSeconds: 10,
  showWelcome: true,
  welcomeText: 'مرحبًا بكم — امسح باركود المنتج لمعرفة السعر',
  showLogo: true,
  slides: [],
  updatedAt: '',
  updatedBy: ''
};

const MAX_VISITOR_SLIDES = 20;

export const SettingsPage: React.FC<SettingsPageProps> = ({
  config,
  items = [],
  users,
  currentUser,
  onSaveUser,
  onSyncAll,
  onLogout,
  onForceLogoutAfterReset,
  initialTab,
  appTheme,
  onChangeTheme,
  motionMode,
  onChangeMotion,
  onUpdateKeyboardShortcuts,
  onDirtyChange,
  onRegisterRevert
}) => {
  const [activeTab, setActiveTab] = useState<CanonicalSettingsTab>(() => normalizeSettingsTab(initialTab));
  const backupSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizeSettingsTab(initialTab));
    }
  }, [initialTab]);

  // Permissions check
  const isOwner = currentUser.role === 'designer' || Boolean(currentUser.isOwner);
  const canManageCompany = isOwner || hasPermission(currentUser, 'settings.company_appearance');
  const canManagePrint = isOwner || hasPermission(currentUser, 'settings.invoice_print');
  const canManageDisplay = isOwner || hasPermission(currentUser, 'settings.display_customization');
  const canManageSalesRules = isOwner || hasPermission(currentUser, 'settings.sales_rules');
  const canManageUiScale = isOwner || hasPermission(currentUser, 'settings.ui_scale');
  const canManageIntegration = isOwner || hasPermission(currentUser, 'settings.system_integration');
  const canManageBackup = isOwner || hasPermission(currentUser, 'settings.backup');
  const canManageBankLink = isOwner || hasPermission(currentUser, 'settings.bank_link');
  const canManageBankTemplates = isOwner || hasPermission(currentUser, 'settings.bank_templates');
  const canResetOperations = isOwner || hasPermission(currentUser, 'settings.reset_operations');
  const canFactoryReset = isOwner || hasPermission(currentUser, 'settings.factory_reset');
  const canManageReset = canResetOperations || canFactoryReset;
  const canManageUsers = isOwner || hasPermission(currentUser, 'users.view');
  const canCreateUser = isOwner || hasPermission(currentUser, 'users.create');
  const canEditUser = isOwner || hasPermission(currentUser, 'users.edit');
  const canDeleteUser = isOwner || hasPermission(currentUser, 'users.edit') || hasPermission(currentUser, 'users.status');
  const canManageNegativeStock = isOwner || hasPermission(currentUser, 'settings.negative_stock');
  const canManageVisitorDisplay = isOwner || hasPermission(currentUser, 'settings.visitor_display');
  const canManageLabelPrint = isOwner || hasPermission(currentUser, 'settings.label_print');
  const canManageInvoiceNumbering = isOwner || hasPermission(currentUser, 'settings.invoice_numbering');
  const canManageShortcuts =
    isOwner ||
    canManageCompany ||
    canManageDisplay ||
    canManageSalesRules ||
    canManagePrint ||
    canManageInvoiceNumbering ||
    canManageLabelPrint ||
    canManageIntegration ||
    canManageBackup ||
    canManageNegativeStock ||
    canManageVisitorDisplay;

  // Helpers for initial domain snapshots
  const buildInitialCompany = (cfg: SystemConfig): CompanySettings => ({
    storeName: cfg.storeName || 'POS مدقق للمنصات الإلكترونية',
    brandTagline: 'نظام إدارة نقاط البيع والتدقيق للمنصات الرقمية',
    logoUrl: '',
    phone: '01012345678',
    email: 'contact@pos-modaqiq.com',
    address: 'القاهرة، مصر',
    taxNumber: '123-456-789',
    commercialRecord: '987654',
    themeColor: '#0e7490',
    accentColor: '#14b8a6',
    fontFamily: 'Tajawal',
    enableDeliveryFee: Boolean(cfg.companySettings?.enableDeliveryFee ?? cfg.enableDeliveryFee),
    ...(cfg.companySettings || {})
  });

  const buildInitialContact = (cfg: SystemConfig): ContactSettings => ({
    supportWhatsapp: cfg.companySettings?.supportWhatsapp || '',
    supportPhone: cfg.companySettings?.supportPhone || '',
    salesWhatsapp: cfg.companySettings?.salesWhatsapp || '',
    salesPhone: cfg.companySettings?.salesPhone || ''
  });

  const buildInitialInvoice = (cfg: SystemConfig): InvoicePrintSettings => {
    const raw = cfg.invoicePrintSettings || ({} as Partial<InvoicePrintSettings>);
    const cleanHeader =
      raw.headerText === 'فاتورة مبيعات مدققة وموثقة على المنصة' ? '' : (raw.headerText ?? '');
    return {
      paperSize: '80mm',
      printableWidthMm: raw.paperSize === '58mm' ? 48 : raw.paperSize === 'a4' ? 190 : 72,
      showReceiptPreview: false,
      showInvoiceNumber: true,
      showDateTime: true,
      showInvoiceStatus: true,
      showHeaderImage: false,
      headerImageUrl: '',
      showLogo: true,
      showCompanyName: true,
      showTagline: true,
      showTaxNumber: true,
      showCommercialRecord: true,
      showAddress: true,
      showPhone: true,
      showCustomerInfo: true,
      showCustomerName: true,
      showCustomerPhone: true,
      showCustomerAddress: true,
      showCustomerBalance: false,
      showPlatform: true,
      showCashier: true,
      showItemsCount: true,
      showPaymentDetails: true,
      showDiscounts: true,
      showBarcode: true,
      showNotes: true,
      footerText: 'شكراً لتعاملكم معنا • جميع المنتجات مدققة ومطابقة لمعايير المنصات',
      termsAndConditions: 'البضاعة المباعة يمكن إرجاعها خلال 14 يومًا بحالتها الأصلية وفق سياسة كل منصة.',
      returnPolicyText: 'يتم احتساب استقطاع شحن المرتجع المقرر للمنصة عند استرجاع المنتج.',
      ...raw,
      headerText: cleanHeader,
      autoFillCashPaid: raw.autoFillCashPaid ?? cfg.displaySettings?.autoFillCashPaid ?? true
    };
  };

  const buildInitialDisplay = (cfg: SystemConfig): DisplaySettings => ({
    showItemImages: true,
    showStockQuantity: true,
    showStockStatusBadge: true,
    showSalePrice: true,
    visibleColumns: ['image', 'name', 'salePrice', 'stock', 'actions'],
    posLayout: 'grid',
    enableQuickBarcodeScan: true,
    confirmInvoiceBeforeSave: true,
    enableInlineEdit: false,
    ...(cfg.displaySettings || {}),
    autoFillCashPaid: cfg.displaySettings?.autoFillCashPaid ?? cfg.invoicePrintSettings?.autoFillCashPaid ?? true
  });

  const buildInitialTax = (cfg: SystemConfig): TaxSettings => ({
    taxInclusive: true,
    platformCommissionOn: 'before_tax',
    ...(cfg.taxSettings || {})
  });

  const buildInitialStock = (cfg: SystemConfig): StockSettings => ({
    allowNegativeStockSale: false,
    allowNegativeWarehouseTransfer: false,
    ...(cfg.stockSettings || {})
  });

  const resolveInitialTheme = (): AppTheme => {
    if (isValidAppTheme(config.companySettings?.appTheme)) return config.companySettings!.appTheme;
    if (isValidAppTheme(appTheme)) return appTheme;
    try {
      const saved = localStorage.getItem('mudaqqeq_theme');
      if (isValidAppTheme(saved)) return saved;
    } catch (_) {}
    return 'light-sky';
  };

  const resolveInitialMotion = (): MotionMode => {
    if (config.companySettings?.motionEnabled !== undefined) {
      return config.companySettings.motionEnabled ? 'on' : 'off';
    }
    if (motionMode) return motionMode;
    try {
      const saved = localStorage.getItem('mudaqqeq_motion');
      if (saved === 'on' || saved === 'off') return saved as MotionMode;
    } catch (_) {}
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return 'off';
    }
    return 'on';
  };

  // Draft & Committed States for Pages 1..6
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() => buildInitialCompany(config));
  const [committedCompany, setCommittedCompany] = useState<CompanySettings>(() => buildInitialCompany(config));

  const [contactSettings, setContactSettings] = useState<ContactSettings>(() => buildInitialContact(config));
  const [committedContact, setCommittedContact] = useState<ContactSettings>(() => buildInitialContact(config));

  const [appliedTheme, setAppliedTheme] = useState<AppTheme>(() => resolveInitialTheme());
  const [previewTheme, setPreviewTheme] = useState<AppTheme>(() => resolveInitialTheme());
  const [currentMotion, setCurrentMotion] = useState<MotionMode>(() => resolveInitialMotion());
  const [committedMotion, setCommittedMotion] = useState<MotionMode>(() => resolveInitialMotion());
  const [isMotionTestModalOpen, setIsMotionTestModalOpen] = useState(false);

  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => readUiPrefs());
  const [committedUiPrefs, setCommittedUiPrefs] = useState<UiPrefs>(() => readUiPrefs());

  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => buildInitialDisplay(config));
  const [committedDisplay, setCommittedDisplay] = useState<DisplaySettings>(() => buildInitialDisplay(config));

  const [invoiceSettings, setInvoiceSettings] = useState<InvoicePrintSettings>(() => buildInitialInvoice(config));
  const [committedInvoice, setCommittedInvoice] = useState<InvoicePrintSettings>(() => buildInitialInvoice(config));
  const [isUploadingHeaderImage, setIsUploadingHeaderImage] = useState(false);
  const [headerImageStatus, setHeaderImageStatus] = useState<string | null>(null);

  const [taxSettings, setTaxSettings] = useState<TaxSettings>(() => buildInitialTax(config));
  const [committedTax, setCommittedTax] = useState<TaxSettings>(() => buildInitialTax(config));

  const [stockSettings, setStockSettings] = useState<StockSettings>(() => buildInitialStock(config));
  const [committedStock, setCommittedStock] = useState<StockSettings>(() => buildInitialStock(config));
  const [isConfirmingNegativeStock, setIsConfirmingNegativeStock] = useState(false);
  const [isConfirmingNegativeTransfer, setIsConfirmingNegativeTransfer] = useState(false);

  const [salesRules, setSalesRules] = useState<SalesRules>(DEFAULT_SALES_RULES);
  const [committedSalesRules, setCommittedSalesRules] = useState<SalesRules>(DEFAULT_SALES_RULES);
  const [salesRulesPlatforms, setSalesRulesPlatforms] = useState<Platform[]>([]);
  const [salesRulesCustomers, setSalesRulesCustomers] = useState<Customer[]>([]);
  const [salesRulesCustomerSearch, setSalesRulesCustomerSearch] = useState('');

  // Visitor Display State
  const [visitorSettings, setVisitorSettings] = useState<VisitorDisplaySettings>(DEFAULT_VISITOR_DISPLAY_SETTINGS);
  const [committedVisitorSettings, setCommittedVisitorSettings] = useState<VisitorDisplaySettings>(DEFAULT_VISITOR_DISPLAY_SETTINGS);
  const [visitorSlides, setVisitorSlides] = useState<VisitorSlide[]>([]);
  const [isUploadingVisitorSlides, setIsUploadingVisitorSlides] = useState(false);
  const [visitorSlidesProgress, setVisitorSlidesProgress] = useState<string | null>(null);
  const [visitorSlidesError, setVisitorSlidesError] = useState<string | null>(null);
  const [visitorSlideToDelete, setVisitorSlideToDelete] = useState<VisitorSlide | null>(null);
  const [isDeletingVisitorSlide, setIsDeletingVisitorSlide] = useState(false);
  const [isReorderingVisitorSlides, setIsReorderingVisitorSlides] = useState(false);

  // Barcode Label Printer Settings State
  const [labelSettings, setLabelSettings] = useState<LabelSettings>(() => defaultLabelSettings());
  const [committedLabelSettings, setCommittedLabelSettings] = useState<LabelSettings>(() =>
    defaultLabelSettings()
  );

  // حالة إعدادات ترقيم الفواتير
  const [invoiceNumbering, setInvoiceNumbering] = useState<InvoiceNumberingSettings>(
    DEFAULT_INVOICE_NUMBERING_SETTINGS
  );
  const [committedInvoiceNumbering, setCommittedInvoiceNumbering] = useState<InvoiceNumberingSettings>(
    DEFAULT_INVOICE_NUMBERING_SETTINGS
  );
  const [nextNumber, setNextNumber] = useState<string>('');
  const [mayRepeat, setMayRepeat] = useState<boolean>(false);
  const [mayRepeatNote, setMayRepeatNote] = useState<string>('');
  const [isSavingNumbering, setIsSavingNumbering] = useState<boolean>(false);
  const [numberingFeedback, setNumberingFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isResetCounterModalOpen, setIsResetCounterModalOpen] = useState<boolean>(false);
  const [resetCounterStartInput, setResetCounterStartInput] = useState<string>('');
  const [isResettingCounter, setIsResettingCounter] = useState<boolean>(false);
  const [resetCounterError, setResetCounterError] = useState<string | null>(null);

  // Unified Bottom Save Bar State
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveBarFeedback, setSaveBarFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const saveSuccessTimerRef = useRef<number | null>(null);

  // Sync external config into committed & clean drafts
  useEffect(() => {
    api.getPublicContactSettings()
      .then((res) => {
        if (res) {
          const cleanRes: ContactSettings = {
            supportWhatsapp: res.supportWhatsapp || '',
            supportPhone: res.supportPhone || '',
            salesWhatsapp: res.salesWhatsapp || '',
            salesPhone: res.salesPhone || ''
          };
          setCommittedContact(cleanRes);
          setContactSettings(cleanRes);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (config.companySettings) {
      const nextCo = buildInitialCompany(config);
      setCommittedCompany(nextCo);
      setCompanySettings(nextCo);
      const nextCt = buildInitialContact(config);
      setCommittedContact(nextCt);
      setContactSettings(nextCt);
      if (isValidAppTheme(config.companySettings.appTheme)) {
        setAppliedTheme(config.companySettings.appTheme);
        setPreviewTheme(config.companySettings.appTheme);
      }
      if (config.companySettings.motionEnabled !== undefined) {
        const m: MotionMode = config.companySettings.motionEnabled ? 'on' : 'off';
        setCommittedMotion(m);
        setCurrentMotion(m);
      }
    }
  }, [config.companySettings]);

  useEffect(() => {
    const nextInv = buildInitialInvoice(config);
    setCommittedInvoice(nextInv);
    setInvoiceSettings(nextInv);
  }, [config.invoicePrintSettings, config.displaySettings?.autoFillCashPaid]);

  useEffect(() => {
    const nextDisp = buildInitialDisplay(config);
    setCommittedDisplay(nextDisp);
    setDisplaySettings(nextDisp);
  }, [config.displaySettings, config.invoicePrintSettings?.autoFillCashPaid]);

  useEffect(() => {
    const nextTax = buildInitialTax(config);
    setCommittedTax(nextTax);
    setTaxSettings(nextTax);
  }, [config.taxSettings]);

  useEffect(() => {
    const nextStock = buildInitialStock(config);
    setCommittedStock(nextStock);
    setStockSettings(nextStock);
  }, [config.stockSettings]);

  useEffect(() => {
    if (!canManageSalesRules) return;
    api.getSalesRules().then((res) => {
      if (res.success && res.rules) {
        setSalesRules(res.rules);
        setCommittedSalesRules(res.rules);
        try {
          localStorage.setItem('mudaqqeq_sales_rules_cache_v1', JSON.stringify(res.rules));
        } catch (_) {}
      }
    }).catch(() => {});
    api.getPlatforms().then((res) => {
      if (res?.success && Array.isArray(res.platforms)) setSalesRulesPlatforms(res.platforms);
    }).catch(() => {});
    api.getCustomers().then((res) => {
      if (res?.success && Array.isArray(res.customers)) setSalesRulesCustomers(res.customers);
    }).catch(() => {});
  }, [canManageSalesRules]);

  useEffect(() => {
    if (!canManageVisitorDisplay) return;
    api.getVisitorConfig()
      .then((res) => {
        if (res && res.settings) {
          setVisitorSettings(res.settings);
          setCommittedVisitorSettings(res.settings);
          setVisitorSlides(
            Array.isArray(res.settings.slides) ? [...res.settings.slides] : []
          );
        }
      })
      .catch(() => {});
  }, [canManageVisitorDisplay]);

  useEffect(() => {
    if (!canManageLabelPrint) return;
    api.getLabelSettings()
      .then((res) => {
        if (res && res.settings) {
          const norm = normalizeLabelSettings(res.settings);
          setLabelSettings(norm);
          setCommittedLabelSettings(norm);
        }
      })
      .catch(() => {});
  }, [canManageLabelPrint]);

  useEffect(() => {
    if (!canManageInvoiceNumbering) return;
    api.getInvoiceNumbering()
      .then((res) => {
        if (res && res.settings) {
          setInvoiceNumbering(res.settings);
          setCommittedInvoiceNumbering(res.settings);
          setNextNumber(res.nextNumber || '');
          setMayRepeat(Boolean(res.mayRepeat));
          setMayRepeatNote(res.mayRepeatNote || '');
        }
      })
      .catch(() => {});
  }, [canManageInvoiceNumbering]);

  const handleSaveInvoiceNumberingSection = async () => {
    if (isSavingNumbering) return;
    setIsSavingNumbering(true);
    setNumberingFeedback(null);
    try {
      const res = await api.saveInvoiceNumbering({
        prefix: invoiceNumbering.prefix,
        datePart: invoiceNumbering.datePart,
        separator: invoiceNumbering.separator,
        digits: Number(invoiceNumbering.digits),
        suffix: invoiceNumbering.suffix,
        resetPeriod: invoiceNumbering.resetPeriod,
        startAt: Number(invoiceNumbering.startAt),
        platformOrderDuplicates: invoiceNumbering.platformOrderDuplicates
      });
      if (!res || !res.success || !res.settings) {
        setNumberingFeedback({
          type: 'error',
          message: (res as any)?.error || 'تعذر حفظ إعدادات ترقيم الفواتير'
        });
        return;
      }
      setInvoiceNumbering(res.settings);
      setCommittedInvoiceNumbering(res.settings);
      setNextNumber(res.nextNumber || '');
      setMayRepeat(Boolean(res.mayRepeat));
      setMayRepeatNote(res.mayRepeatNote || '');
      setNumberingFeedback({ type: 'success', message: 'تم حفظ ترقيم الفواتير' });
    } catch (err: any) {
      setNumberingFeedback({
        type: 'error',
        message: err?.message || 'تعذر حفظ إعدادات ترقيم الفواتير'
      });
    } finally {
      setIsSavingNumbering(false);
    }
  };

  const handleConfirmResetInvoiceCounter = async () => {
    if (isResettingCounter) return;
    setIsResettingCounter(true);
    setResetCounterError(null);
    try {
      const trimmed = resetCounterStartInput.trim();
      const customStart = trimmed !== '' ? Number(trimmed) : undefined;
      const res = await api.resetInvoiceCounter(customStart);
      if (!res || !res.success) {
        setResetCounterError((res as any)?.error || 'تعذر تصفير عد الفواتير');
        return;
      }
      if (res.settings) {
        setInvoiceNumbering(res.settings);
        setCommittedInvoiceNumbering(res.settings);
      }
      setNextNumber(res.nextNumber || '');
      setMayRepeat(Boolean(res.mayRepeat));
      setMayRepeatNote(res.mayRepeatNote || '');
      setIsResetCounterModalOpen(false);
      setResetCounterStartInput('');
      setNumberingFeedback({ type: 'success', message: 'تم تصفير عد الفواتير' });
    } catch (err: any) {
      setResetCounterError(err?.message || 'تعذر تصفير عد الفواتير');
    } finally {
      setIsResettingCounter(false);
    }
  };

  // Listen to external UI Prefs events (e.g. from POS quick scale button)
  const committedDisplayRef = useRef<{ showItemImages?: boolean; posLayout?: string }>({
    showItemImages: config.displaySettings?.showItemImages,
    posLayout: config.displaySettings?.posLayout
  });
  const committedCompanyRef = useRef(committedCompany);
  const appliedThemeRef = useRef(appliedTheme);
  const committedMotionRef = useRef(committedMotion);

  useEffect(() => {
    committedDisplayRef.current = {
      showItemImages: committedDisplay.showItemImages,
      posLayout: committedDisplay.posLayout
    };
  }, [committedDisplay.showItemImages, committedDisplay.posLayout]);

  useEffect(() => {
    committedCompanyRef.current = committedCompany;
  }, [committedCompany]);

  useEffect(() => {
    appliedThemeRef.current = appliedTheme;
  }, [appliedTheme]);

  useEffect(() => {
    committedMotionRef.current = committedMotion;
  }, [committedMotion]);

  useEffect(() => {
    const handlePrefsUpdate = (e: Event) => {
      const custom = e as CustomEvent<UiPrefs>;
      const next = custom.detail ? custom.detail : readUiPrefs();
      setCommittedUiPrefs(next);
      setUiPrefs(next);
    };
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === UI_PREFS_STORAGE_KEY) {
        const next = readUiPrefs();
        setCommittedUiPrefs(next);
        setUiPrefs(next);
      }
    };
    window.addEventListener(UI_PREFS_EVENT, handlePrefsUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(UI_PREFS_EVENT, handlePrefsUpdate);
      window.removeEventListener('storage', handleStorage);
      // Roll back live previews on unmount if unsaved
      applyUiPrefs(readUiPrefs(), false, document.documentElement, committedDisplayRef.current);
      applyFontPreview(committedCompanyRef.current.fontFamily);
      document.documentElement.setAttribute('data-theme', appliedThemeRef.current);
      document.documentElement.setAttribute('data-motion', committedMotionRef.current);
    };
  }, []);

  // Dirty Calculation Per Active Page (Pages 1..6)
  const pageDiffs = useMemo(() => {
    const companyIdentityDirty =
      companySettings.storeName !== committedCompany.storeName ||
      companySettings.brandTagline !== committedCompany.brandTagline ||
      companySettings.logoUrl !== committedCompany.logoUrl ||
      companySettings.taxNumber !== committedCompany.taxNumber ||
      companySettings.commercialRecord !== committedCompany.commercialRecord ||
      companySettings.phone !== committedCompany.phone ||
      companySettings.email !== committedCompany.email ||
      companySettings.address !== committedCompany.address;

    const contactDirty =
      contactSettings.supportWhatsapp !== committedContact.supportWhatsapp ||
      contactSettings.supportPhone !== committedContact.supportPhone ||
      contactSettings.salesWhatsapp !== committedContact.salesWhatsapp ||
      contactSettings.salesPhone !== committedContact.salesPhone;

    const themeDirty = previewTheme !== appliedTheme;
    const motionDirty = currentMotion !== committedMotion;
    const fontDirty = (companySettings.fontFamily || 'Tajawal') !== (committedCompany.fontFamily || 'Tajawal');
    const uiPrefsDirty =
      uiPrefs.appScale !== committedUiPrefs.appScale ||
      uiPrefs.posScale !== committedUiPrefs.posScale ||
      uiPrefs.posPanelWidth !== committedUiPrefs.posPanelWidth ||
      uiPrefs.posCardSize !== committedUiPrefs.posCardSize ||
      uiPrefs.posCategorySize !== committedUiPrefs.posCategorySize ||
      Boolean(uiPrefs.posFrameless) !== Boolean(committedUiPrefs.posFrameless);
    const displayAppearanceDirty =
      Boolean(displaySettings.showItemImages) !== Boolean(committedDisplay.showItemImages) ||
      (displaySettings.posLayout === 'list' ? 'list' : 'grid') !==
        (committedDisplay.posLayout === 'list' ? 'list' : 'grid');

    const salesNormPlatformId =
      salesRules.platformSelection === 'fixed' ? salesRules.defaultPlatformId : '';
    const committedNormPlatformId =
      committedSalesRules.platformSelection === 'fixed' ? committedSalesRules.defaultPlatformId : '';
    const salesNormCustomerId =
      salesRules.customerSelection === 'fixed' ? salesRules.defaultCustomerId : '';
    const committedNormCustomerId =
      committedSalesRules.customerSelection === 'fixed' ? committedSalesRules.defaultCustomerId : '';

    const salesRulesDirty =
      salesRules.defaultSaleMode !== committedSalesRules.defaultSaleMode ||
      salesRules.platformSelection !== committedSalesRules.platformSelection ||
      salesNormPlatformId !== committedNormPlatformId ||
      salesRules.customerSelection !== committedSalesRules.customerSelection ||
      salesNormCustomerId !== committedNormCustomerId ||
      Boolean(salesRules.allowZeroPriceSale) !== Boolean(committedSalesRules.allowZeroPriceSale) ||
      Boolean(salesRules.allowBelowCostSale) !== Boolean(committedSalesRules.allowBelowCostSale) ||
      Boolean(salesRules.platformAlwaysCredit) !== Boolean(committedSalesRules.platformAlwaysCredit);

    const salesDisplayDirty =
      Boolean(displaySettings.confirmInvoiceBeforeSave) !== Boolean(committedDisplay.confirmInvoiceBeforeSave) ||
      (displaySettings.autoFillCashPaid ?? true) !== (committedDisplay.autoFillCashPaid ?? true);

    const deliveryFeeDirty =
      Boolean(companySettings.enableDeliveryFee) !== Boolean(committedCompany.enableDeliveryFee);

    const stockPolicyDirty =
      Boolean(stockSettings.allowNegativeStockSale) !== Boolean(committedStock.allowNegativeStockSale) ||
      Boolean(stockSettings.allowNegativeWarehouseTransfer) !== Boolean(committedStock.allowNegativeWarehouseTransfer);

    const stockDisplayDirty =
      Boolean(displaySettings.showStockQuantity) !== Boolean(committedDisplay.showStockQuantity) ||
      Boolean(displaySettings.showStockStatusBadge) !== Boolean(committedDisplay.showStockStatusBadge) ||
      Boolean(displaySettings.enableInlineEdit) !== Boolean(committedDisplay.enableInlineEdit);

    const printKeys: Array<keyof InvoicePrintSettings> = [
      'paperSize',
      'printableWidthMm',
      'showReceiptPreview',
      'showHeaderImage',
      'headerImageUrl',
      'showInvoiceNumber',
      'showDateTime',
      'showInvoiceStatus',
      'showLogo',
      'showCompanyName',
      'showTagline',
      'showTaxNumber',
      'showCommercialRecord',
      'showAddress',
      'showPhone',
      'showPlatform',
      'showCashier',
      'showCustomerName',
      'showCustomerPhone',
      'showCustomerAddress',
      'showCustomerBalance',
      'printedItemLabel',
      'showItemsCount',
      'showPaymentDetails',
      'showDiscounts',
      'showBarcode',
      'showNotes',
      'headerText',
      'footerText',
      'termsAndConditions',
      'returnPolicyText'
    ];
    const printDirty = printKeys.some(
      (k) => (invoiceSettings[k] ?? '') !== (committedInvoice[k] ?? '')
    );

    const taxDirty =
      Boolean(taxSettings.taxInclusive) !== Boolean(committedTax.taxInclusive) ||
      taxSettings.platformCommissionOn !== committedTax.platformCommissionOn;

    const visitorDirty =
      Number(visitorSettings.slideSeconds) !== Number(committedVisitorSettings.slideSeconds) ||
      Number(visitorSettings.resultSeconds) !== Number(committedVisitorSettings.resultSeconds) ||
      Boolean(visitorSettings.showWelcome) !== Boolean(committedVisitorSettings.showWelcome) ||
      (visitorSettings.welcomeText || '') !== (committedVisitorSettings.welcomeText || '') ||
      Boolean(visitorSettings.showLogo) !== Boolean(committedVisitorSettings.showLogo);

    const serializeLabelDraft = (s: LabelSettings) => {
      const { updatedAt: _uAt, updatedBy: _uBy, ...rest } = s;
      return JSON.stringify(rest);
    };
    const labelsDirty =
      serializeLabelDraft(labelSettings) !== serializeLabelDraft(committedLabelSettings);

    return {
      company: companyIdentityDirty || contactDirty,
      companyIdentityDirty,
      contactDirty,
      appearance: themeDirty || motionDirty || fontDirty || uiPrefsDirty || displayAppearanceDirty,
      themeDirty,
      motionDirty,
      fontDirty,
      uiPrefsDirty,
      displayAppearanceDirty,
      sales: salesRulesDirty || salesDisplayDirty || deliveryFeeDirty,
      salesRulesDirty,
      salesDisplayDirty,
      deliveryFeeDirty,
      visitor: visitorDirty,
      stock: stockPolicyDirty || stockDisplayDirty,
      stockPolicyDirty,
      stockDisplayDirty,
      print: printDirty,
      labels: labelsDirty,
      tax: taxDirty
    };
  }, [
    companySettings,
    committedCompany,
    contactSettings,
    committedContact,
    previewTheme,
    appliedTheme,
    currentMotion,
    committedMotion,
    uiPrefs,
    committedUiPrefs,
    displaySettings,
    committedDisplay,
    salesRules,
    committedSalesRules,
    visitorSettings,
    committedVisitorSettings,
    stockSettings,
    committedStock,
    invoiceSettings,
    committedInvoice,
    labelSettings,
    committedLabelSettings,
    taxSettings,
    committedTax
  ]);

  const isActiveTabDirty =
    activeTab === 'company'
      ? pageDiffs.company
      : activeTab === 'appearance'
      ? pageDiffs.appearance
      : activeTab === 'sales'
      ? pageDiffs.sales
      : activeTab === 'visitor'
      ? pageDiffs.visitor
      : activeTab === 'stock'
      ? pageDiffs.stock
      : activeTab === 'print'
      ? pageDiffs.print
      : activeTab === 'labels'
      ? pageDiffs.labels
      : activeTab === 'tax'
      ? pageDiffs.tax
      : false;

  const isSaveBarSupportedTab =
    activeTab === 'company' ||
    activeTab === 'appearance' ||
    activeTab === 'sales' ||
    activeTab === 'visitor' ||
    activeTab === 'stock' ||
    activeTab === 'print' ||
    activeTab === 'labels' ||
    activeTab === 'tax';

  useEffect(() => {
    onDirtyChange?.(isActiveTabDirty);
  }, [isActiveTabDirty, onDirtyChange]);

  useEffect(() => {
    setSaveBarFeedback(null);
  }, [activeTab]);

  // Live Preview handlers (no immediate DB persistence on Appearance tab)
  const handlePreviewTheme = (themeId: AppTheme) => {
    setPreviewTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    onChangeTheme?.(themeId);
    setSaveBarFeedback(null);
  };

  const handleToggleMotion = (nextMode: MotionMode) => {
    setCurrentMotion(nextMode);
    document.documentElement.setAttribute('data-motion', nextMode);
    onChangeMotion?.(nextMode);
    setSaveBarFeedback(null);
  };

  const handleUpdateUiPrefs = (patch: Partial<UiPrefs>) => {
    if (!canManageUiScale) return;
    const next: UiPrefs = { ...uiPrefs, ...patch };
    setUiPrefs(next);
    setSaveBarFeedback(null);
    applyUiPrefs(next, false, document.documentElement, {
      showItemImages: displaySettings.showItemImages,
      posLayout: displaySettings.posLayout
    });
  };

  const handleResetUiPrefs = () => {
    if (!canManageUiScale) return;
    const next: UiPrefs = { ...DEFAULT_UI_PREFS };
    setUiPrefs(next);
    setSaveBarFeedback(null);
    applyUiPrefs(next, false, document.documentElement, {
      showItemImages: displaySettings.showItemImages,
      posLayout: displaySettings.posLayout
    });
  };

  const handleSaveUiPrefs = (): UiPrefs => {
    const saved = writeUiPrefs(uiPrefs);
    setUiPrefs(saved);
    setCommittedUiPrefs(saved);
    applyUiPrefs(saved, false, document.documentElement, {
      showItemImages: displaySettings.showItemImages,
      posLayout: displaySettings.posLayout
    });
    return saved;
  };

  // Revert Draft & DOM Live Previews back to Committed State
  const handleRevertActiveTab = useCallback(() => {
    setSaveBarFeedback(null);
    setCompanySettings(committedCompany);
    setContactSettings(committedContact);
    setPreviewTheme(appliedTheme);
    document.documentElement.setAttribute('data-theme', appliedTheme);
    onChangeTheme?.(appliedTheme);
    setCurrentMotion(committedMotion);
    document.documentElement.setAttribute('data-motion', committedMotion);
    onChangeMotion?.(committedMotion);
    applyFontPreview(committedCompany.fontFamily);
    setUiPrefs(committedUiPrefs);
    applyUiPrefs(committedUiPrefs, false, document.documentElement, {
      showItemImages: committedDisplay.showItemImages,
      posLayout: committedDisplay.posLayout
    });
    setDisplaySettings(committedDisplay);
    setSalesRules(committedSalesRules);
    setVisitorSettings(committedVisitorSettings);
    setStockSettings(committedStock);
    setInvoiceSettings(committedInvoice);
    setLabelSettings(committedLabelSettings);
    setTaxSettings(committedTax);
  }, [
    committedCompany,
    committedContact,
    appliedTheme,
    committedMotion,
    committedUiPrefs,
    committedDisplay,
    committedSalesRules,
    committedVisitorSettings,
    committedStock,
    committedInvoice,
    committedLabelSettings,
    committedTax,
    onChangeTheme,
    onChangeMotion
  ]);

  useEffect(() => {
    onRegisterRevert?.(handleRevertActiveTab);
  }, [handleRevertActiveTab, onRegisterRevert]);

  // Unified Bottom Save Handler (Sequential per dirty domain, stops on first error)
  const handleUnifiedSave = async () => {
    if (isSavingAll || !isActiveTabDirty) return;
    if (saveSuccessTimerRef.current) {
      window.clearTimeout(saveSuccessTimerRef.current);
      saveSuccessTimerRef.current = null;
    }
    setSaveBarFeedback(null);

    // Pre-validate phone format on Company tab before hitting network
    if (activeTab === 'company' && pageDiffs.contactDirty) {
      const fields: Array<{ key: keyof ContactSettings; label: string }> = [
        { key: 'supportWhatsapp', label: 'واتساب الدعم الفني' },
        { key: 'supportPhone', label: 'هاتف الدعم الفني' },
        { key: 'salesWhatsapp', label: 'واتساب المبيعات' },
        { key: 'salesPhone', label: 'هاتف المبيعات' }
      ];
      for (const f of fields) {
        const val = (contactSettings[f.key] || '').trim();
        if (val && !/^\+?[0-9]+$/.test(val)) {
          setSaveBarFeedback({
            type: 'error',
            message: `${f.label}: يرجى إدخال أرقام فقط مع إمكانية علامة + في البداية`
          });
          return;
        }
      }
    }

    setIsSavingAll(true);
    try {
      let runningCompany = { ...committedCompany };
      let runningDisplay = { ...committedDisplay };
      let runningInvoice = { ...committedInvoice };

      if (activeTab === 'company') {
        if (pageDiffs.companyIdentityDirty) {
          const payload: CompanySettings = {
            ...runningCompany,
            storeName: companySettings.storeName,
            brandTagline: companySettings.brandTagline,
            logoUrl: companySettings.logoUrl,
            taxNumber: companySettings.taxNumber,
            commercialRecord: companySettings.commercialRecord,
            phone: companySettings.phone,
            email: companySettings.email,
            address: companySettings.address
          };
          const res = await api.saveCompanySettings(payload);
          if (res && res.success === false) {
            throw new Error((res as any).error || 'فشل حفظ بيانات المنشأة');
          }
          runningCompany = payload;
          setCommittedCompany(payload);
        }

        if (pageDiffs.contactDirty) {
          const res = await api.saveContactSettings({
            supportWhatsapp: contactSettings.supportWhatsapp.trim(),
            supportPhone: contactSettings.supportPhone.trim(),
            salesWhatsapp: contactSettings.salesWhatsapp.trim(),
            salesPhone: contactSettings.salesPhone.trim()
          });
          if (!res.success) {
            throw new Error(res.error || 'تعذر حفظ بيانات التواصل');
          }
          const savedCt = res.settings || {
            supportWhatsapp: contactSettings.supportWhatsapp.trim(),
            supportPhone: contactSettings.supportPhone.trim(),
            salesWhatsapp: contactSettings.salesWhatsapp.trim(),
            salesPhone: contactSettings.salesPhone.trim()
          };
          setCommittedContact(savedCt);
          setContactSettings(savedCt);
        }
      } else if (activeTab === 'appearance') {
        if (pageDiffs.themeDirty || pageDiffs.motionDirty || pageDiffs.fontDirty) {
          const payload: CompanySettings = {
            ...runningCompany,
            appTheme: previewTheme,
            motionEnabled: currentMotion === 'on',
            fontFamily: companySettings.fontFamily
          };
          const res = await api.saveCompanySettings(payload);
          if (res && res.success === false) {
            throw new Error((res as any).error || 'فشل حفظ إعدادات المظهر والخط والحركة');
          }
          runningCompany = payload;
          setCommittedCompany(payload);
          setAppliedTheme(previewTheme);
          setCommittedMotion(currentMotion);
          try {
            localStorage.setItem('mudaqqeq_theme', previewTheme);
            localStorage.setItem('mudaqqeq_motion', currentMotion);
          } catch (_) {}
          onChangeTheme?.(previewTheme);
          onChangeMotion?.(currentMotion);
          applyFontPreview(payload.fontFamily);
        }

        if (pageDiffs.uiPrefsDirty) {
          handleSaveUiPrefs();
        }

        if (pageDiffs.displayAppearanceDirty) {
          const payload: DisplaySettings = {
            ...runningDisplay,
            showItemImages: displaySettings.showItemImages,
            posLayout: displaySettings.posLayout
          };
          const res = await api.saveDisplaySettings(payload);
          if (res && res.success === false) {
            throw new Error((res as any).error || 'فشل حفظ إعدادات عرض الأصناف');
          }
          runningDisplay = payload;
          setCommittedDisplay(payload);
        }
      } else if (activeTab === 'sales') {
        if (pageDiffs.salesRulesDirty) {
          const res = await api.saveSalesRules({
            defaultSaleMode: salesRules.defaultSaleMode,
            platformSelection: salesRules.platformSelection,
            defaultPlatformId: salesRules.platformSelection === 'fixed' ? salesRules.defaultPlatformId : '',
            customerSelection: salesRules.customerSelection,
            defaultCustomerId: salesRules.customerSelection === 'fixed' ? salesRules.defaultCustomerId : '',
            allowZeroPriceSale: salesRules.allowZeroPriceSale,
            allowBelowCostSale: salesRules.allowBelowCostSale,
            platformAlwaysCredit: Boolean(salesRules.platformAlwaysCredit)
          });
          if (!res.success || !res.rules) {
            throw new Error(res.error || 'تعذر حفظ إعدادات البيع وقواعد السعر');
          }
          setSalesRules(res.rules);
          setCommittedSalesRules(res.rules);
          try {
            localStorage.setItem('mudaqqeq_sales_rules_cache_v1', JSON.stringify(res.rules));
          } catch (_) {}
        }

        if (pageDiffs.salesDisplayDirty) {
          const autoFillVal = displaySettings.autoFillCashPaid ?? true;
          if (canManageDisplay || !canManagePrint) {
            const dispPayload: DisplaySettings = {
              ...runningDisplay,
              confirmInvoiceBeforeSave: displaySettings.confirmInvoiceBeforeSave,
              autoFillCashPaid: autoFillVal
            };
            const dispRes = await api.saveDisplaySettings(dispPayload);
            if (dispRes && dispRes.success === false) {
              throw new Error((dispRes as any).error || 'فشل حفظ خيارات الفاتورة');
            }
            runningDisplay = dispPayload;
            setCommittedDisplay(dispPayload);
          }
          if (canManagePrint) {
            const invPayload: InvoicePrintSettings = {
              ...runningInvoice,
              autoFillCashPaid: autoFillVal
            };
            const invRes = await api.saveInvoicePrintSettings(invPayload);
            if (invRes && invRes.success === false) {
              throw new Error((invRes as any).error || 'فشل تحديث إعداد تعبئة المدفوع في الطباعة');
            }
            runningInvoice = invPayload;
            setCommittedInvoice(invPayload);
            if (!canManageDisplay) {
              runningDisplay = { ...runningDisplay, autoFillCashPaid: autoFillVal };
              setCommittedDisplay(runningDisplay);
            }
          }
        }

        if (pageDiffs.deliveryFeeDirty) {
          const payload: CompanySettings = {
            ...runningCompany,
            enableDeliveryFee: Boolean(companySettings.enableDeliveryFee)
          };
          const res = await api.saveCompanySettings(payload);
          if (res && res.success === false) {
            throw new Error((res as any).error || 'فشل حفظ إعداد رسوم التوصيل');
          }
          runningCompany = payload;
          setCommittedCompany(payload);
        }
      } else if (activeTab === 'stock') {
        if (pageDiffs.stockPolicyDirty) {
          const stockRes = await api.saveStockSettings({
            allowNegativeStockSale: stockSettings.allowNegativeStockSale,
            allowNegativeWarehouseTransfer: stockSettings.allowNegativeWarehouseTransfer
          });
          if (!stockRes.success) {
            throw new Error((stockRes as any).error || 'فشل حفظ سياسة المخزون');
          }
          const nextStock = stockRes.settings || { ...stockSettings };
          setStockSettings(nextStock);
          setCommittedStock(nextStock);
        }

        if (pageDiffs.stockDisplayDirty) {
          const payload: DisplaySettings = {
            ...runningDisplay,
            showStockQuantity: displaySettings.showStockQuantity,
            showStockStatusBadge: displaySettings.showStockStatusBadge,
            enableInlineEdit: displaySettings.enableInlineEdit
          };
          const res = await api.saveDisplaySettings(payload);
          if (res && res.success === false) {
            throw new Error((res as any).error || 'فشل حفظ إعدادات عرض المخزون');
          }
          runningDisplay = payload;
          setCommittedDisplay(payload);
        }
      } else if (activeTab === 'print') {
        const payload: InvoicePrintSettings = {
          ...invoiceSettings,
          autoFillCashPaid: runningInvoice.autoFillCashPaid
        };
        const res = await api.saveInvoicePrintSettings(payload);
        if (res && res.success === false) {
          throw new Error((res as any).error || 'فشل حفظ إعدادات الفاتورة والطباعة');
        }
        setCommittedInvoice(payload);
      } else if (activeTab === 'tax') {
        const res = await api.saveTaxSettings(taxSettings);
        if (res && res.success === false) {
          throw new Error((res as any).error || 'فشل حفظ إعدادات الضريبة والعمولة');
        }
        setCommittedTax({ ...taxSettings });
      } else if (activeTab === 'visitor') {
        const clampedSlideSec = Math.max(3, Math.min(60, Math.round(Number(visitorSettings.slideSeconds) || 8)));
        const clampedResultSec = Math.max(3, Math.min(60, Math.round(Number(visitorSettings.resultSeconds) || 6)));
        const trimmedWelcome = String(visitorSettings.welcomeText || '').slice(0, 120);
        const res = await api.saveVisitorSettings({
          slideSeconds: clampedSlideSec,
          resultSeconds: clampedResultSec,
          showWelcome: Boolean(visitorSettings.showWelcome),
          welcomeText: trimmedWelcome,
          showLogo: Boolean(visitorSettings.showLogo)
        });
        if (!res.success || !res.settings) {
          throw new Error(res.error || 'تعذر حفظ إعدادات شاشة الزوار');
        }
        setVisitorSettings(res.settings);
        setCommittedVisitorSettings(res.settings);
      } else if (activeTab === 'labels') {
        const validationErrors = validateLabelSettings(labelSettings);
        if (validationErrors.length > 0) {
          throw new Error(validationErrors[0]);
        }
        const res = await api.saveLabelSettings(labelSettings);
        if (!res || !res.settings) {
          throw new Error('تعذر حفظ إعدادات طابعة الباركود');
        }
        const savedNorm = normalizeLabelSettings(res.settings);
        setLabelSettings(savedNorm);
        setCommittedLabelSettings(savedNorm);
      }

      setSaveBarFeedback({ type: 'success', message: 'تم الحفظ بنجاح' });
      await onSyncAll();
      saveSuccessTimerRef.current = window.setTimeout(() => {
        setSaveBarFeedback(null);
      }, 2600);
    } catch (err: any) {
      setSaveBarFeedback({
        type: 'error',
        message: err?.message || 'تعذر حفظ بعض التغييرات'
      });
    } finally {
      setIsSavingAll(false);
    }
  };

  // Toggle Negative Stock / Negative Transfer (with warning confirmation modal when turning ON)
  const handleToggleNegativeStockClick = () => {
    if (!stockSettings.allowNegativeStockSale) {
      setIsConfirmingNegativeStock(true);
    } else {
      setStockSettings((prev) => ({ ...prev, allowNegativeStockSale: false }));
    }
  };

  const handleToggleNegativeTransferClick = () => {
    if (!stockSettings.allowNegativeWarehouseTransfer) {
      setIsConfirmingNegativeTransfer(true);
    } else {
      setStockSettings((prev) => ({ ...prev, allowNegativeWarehouseTransfer: false }));
    }
  };

  // Database & Backup Tab State (Page 8)
  const [dbStatus, setDbStatus] = useState<DatabaseStatusResponse | null>(null);
  const [isLoadingDbStatus, setIsLoadingDbStatus] = useState(false);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [dbCheckResult, setDbCheckResult] = useState<{
    configured: boolean;
    check?: DatabaseCheckResult | null;
    message?: string;
  } | null>(null);
  const [isCopyingSetupSql, setIsCopyingSetupSql] = useState(false);
  const [setupSqlCopied, setSetupSqlCopied] = useState(false);
  const [dbActionError, setDbActionError] = useState<string | null>(null);

  // Images Storage & Migration State
  const [imagesStatus, setImagesStatus] = useState<ImagesStorageStatus | null>(null);
  const [isLoadingImagesStatus, setIsLoadingImagesStatus] = useState(false);
  const [isMigratingImages, setIsMigratingImages] = useState(false);
  const [imagesMigrationProgress, setImagesMigrationProgress] = useState<string | null>(null);
  const [imagesMigrationResult, setImagesMigrationResult] = useState<ImagesMigrationResult | null>(null);
  const [imagesMigrationError, setImagesMigrationError] = useState<string | null>(null);

  const [backupMeta, setBackupMeta] = useState<BackupMetaInfo | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupSectionFeedback, setBackupSectionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [restoreFileBase64, setRestoreFileBase64] = useState<string>('');
  const [restoreFileName, setRestoreFileName] = useState<string>('');
  const [isInspectingBackup, setIsInspectingBackup] = useState(false);
  const [inspectedBackup, setInspectedBackup] = useState<{
    summary: BackupSummaryInfo;
    currentTenant: string;
    tenantMismatch: boolean;
  } | null>(null);
  const [restoreStage, setRestoreStage] = useState<'select' | 'summary' | 'confirm'>('select');
  const [isTakingPreRestoreBackup, setIsTakingPreRestoreBackup] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);

  // Offline Backup Directory & Local Storage State
  const [backupDirStatus, setBackupDirStatus] = useState<BackupDirectoryStatus | null>(null);
  const [storageQuota, setStorageQuota] = useState<StorageQuotaStatus | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isClearingLocalData, setIsClearingLocalData] = useState(false);

  const refreshOfflineBackupStatus = async () => {
    try {
      const [dirStat, quotaStat] = await Promise.all([
        getBackupDirectoryStatus(),
        checkStorageQuotaStatus()
      ]);
      setBackupDirStatus(dirStat);
      setStorageQuota(quotaStat);
    } catch (_) {}
  };

  useEffect(() => {
    refreshOfflineBackupStatus();
  }, []);

  const handleChooseBackupDirectory = async () => {
    setBackupFeedback(null);
    try {
      const res = await selectBackupDirectory();
      await refreshOfflineBackupStatus();
      if (res.configured) {
        setBackupFeedback({
          type: 'success',
          message: `تم اختيار مجلد النسخ الاحتياطي (${res.directoryName}) وحفظ الإذن في قاعدة البيانات المحلية بنجاح.`
        });
      }
    } catch (err: any) {
      await refreshOfflineBackupStatus();
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'تعذر اختيار مجلد النسخ الاحتياطي'
      });
    }
  };

  const handleActivateBackupDirectory = async () => {
    setBackupFeedback(null);
    try {
      const res = await activateBackupDirectoryPermission();
      await refreshOfflineBackupStatus();
      if (res.permission === 'granted') {
        setBackupFeedback({
          type: 'success',
          message: `تم تفعيل النسخ الاحتياطي للمجلد (${res.directoryName}) بنجاح.`
        });
      } else {
        setBackupFeedback({
          type: 'error',
          message: 'لم يتم منح إذن الكتابة في المجلد المختار.'
        });
      }
    } catch (err: any) {
      await refreshOfflineBackupStatus();
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'تعذر تفعيل إذن مجلد النسخ الاحتياطي'
      });
    }
  };

  const handleClearLocalAppData = async () => {
    setBackupFeedback(null);
    setIsClearingLocalData(true);
    try {
      const res = await clearLocalApplicationDataSafely();
      setBackupFeedback({
        type: 'success',
        message: res.message || 'تم مسح بيانات التطبيق المحلية بأمان بعد التأكد من عدم وجود أي عمليات معلّقة.'
      });
      await refreshOfflineBackupStatus();
    } catch (err: any) {
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'لا يمكن مسح بيانات التطبيق حاليًا لوجود عمليات معلّقة لم تُرفع بعد.'
      });
    } finally {
      setIsClearingLocalData(false);
    }
  };

  const formatDateTimeCairo = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  };

  const loadDatabaseAndBackupInfo = async () => {
    if (canManageIntegration) {
      setIsLoadingDbStatus(true);
      setIsLoadingImagesStatus(true);
      try {
        const [res, imgRes] = await Promise.all([
          api.getDatabaseStatus(),
          api.getImagesStatus().catch(() => null)
        ]);
        setDbStatus(res);
        if (res.backup) setBackupMeta(res.backup);
        if (imgRes) setImagesStatus(imgRes);
      } catch (err: any) {
        setDbActionError(err?.message || 'تعذر قراءة حالة قاعدة البيانات');
      } finally {
        setIsLoadingDbStatus(false);
        setIsLoadingImagesStatus(false);
      }
    }
    if (canManageBackup) {
      try {
        const bRes = await api.getBackupStatus();
        if (bRes.backup) setBackupMeta(bRes.backup);
      } catch (_) {}
    }
  };

  const handleMigrateImages = async () => {
    if (isMigratingImages || !canManageIntegration) return;
    setIsMigratingImages(true);
    setImagesMigrationError(null);
    setImagesMigrationResult(null);
    setImagesMigrationProgress('تم نقل 0…');
    try {
      let totalMoved = 0;
      let totalFailed = 0;
      let lastRemaining = imagesStatus?.inline?.total ?? 0;
      const allErrors: string[] = [];

      // Loop batches until remaining === 0 or remaining stops decreasing
      for (let round = 0; round < 50; round++) {
        const res = await api.migrateImages();
        const movedThisBatch = Number(res.moved) || 0;
        const failedThisBatch = Number(res.failed) || 0;
        const remainingNow = Number(res.remaining) || 0;

        totalMoved += movedThisBatch;
        totalFailed += failedThisBatch;
        if (Array.isArray(res.errors)) {
          for (const e of res.errors) {
            if (e && !allErrors.includes(e)) allErrors.push(e);
          }
        }

        setImagesMigrationProgress(`تم نقل ${totalMoved}…`);

        if (remainingNow === 0) {
          lastRemaining = 0;
          break;
        }
        if (movedThisBatch === 0 || (round > 0 && remainingNow >= lastRemaining)) {
          lastRemaining = remainingNow;
          break;
        }
        lastRemaining = remainingNow;
      }

      const finalStatus = await api.getImagesStatus().catch(() => null);
      if (finalStatus) {
        setImagesStatus(finalStatus);
        lastRemaining = finalStatus.inline?.total ?? lastRemaining;
      }

      setImagesMigrationResult({
        success: true,
        moved: totalMoved,
        failed: totalFailed,
        remaining: lastRemaining,
        errors: allErrors
      });
    } catch (err: any) {
      setImagesMigrationError(err?.message || 'تعذر نقل الصور للسيرفر');
    } finally {
      setIsMigratingImages(false);
      setImagesMigrationProgress(null);
    }
  };

  // Visitor Slides Immediate Handlers
  const handleAddVisitorSlidesFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (e.target) e.target.value = '';
    if (files.length === 0 || !canManageVisitorDisplay || isUploadingVisitorSlides) return;

    const currentCount = visitorSlides.length;
    const availableSlots = MAX_VISITOR_SLIDES - currentCount;
    if (availableSlots <= 0) {
      setVisitorSlidesError(`الحد الأقصى لصور العرض هو ${MAX_VISITOR_SLIDES} صورة`);
      return;
    }

    const filesToUpload = files.slice(0, availableSlots);
    setIsUploadingVisitorSlides(true);
    setVisitorSlidesError(null);

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        setVisitorSlidesProgress(`جاري رفع الصورة ${i + 1} من ${filesToUpload.length}…`);
        const base64 = await resizeVisitorSlideImage(filesToUpload[i], 1920);
        const res = await api.addVisitorSlide(base64);
        if (!res.success || !res.settings) {
          throw new Error(res.error || 'تعذر رفع الصورة');
        }
        setVisitorSlides(
          Array.isArray(res.settings.slides) ? [...res.settings.slides] : []
        );
      }
      if (files.length > availableSlots) {
        setVisitorSlidesError(
          `تم رفع ${availableSlots} صورة فقط للوصول للحد الأقصى (${MAX_VISITOR_SLIDES} صورة)`
        );
      }
    } catch (err: any) {
      setVisitorSlidesError(err?.message || 'حدث خطأ أثناء رفع صور العرض');
    } finally {
      setIsUploadingVisitorSlides(false);
      setVisitorSlidesProgress(null);
    }
  };

  const handleMoveVisitorSlide = async (index: number, direction: 'up' | 'down') => {
    if (!canManageVisitorDisplay || isReorderingVisitorSlides) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= visitorSlides.length) return;

    const nextList = [...visitorSlides];
    const [movedItem] = nextList.splice(index, 1);
    nextList.splice(targetIndex, 0, movedItem);
    setVisitorSlides(nextList);
    setIsReorderingVisitorSlides(true);
    setVisitorSlidesError(null);
    try {
      const res = await api.orderVisitorSlides(nextList.map((s) => s.id));
      if (res.success && res.settings) {
        setVisitorSlides(
          Array.isArray(res.settings.slides) ? [...res.settings.slides] : []
        );
      }
    } catch (err: any) {
      setVisitorSlidesError(err?.message || 'تعذر تغيير ترتيب الصور');
    } finally {
      setIsReorderingVisitorSlides(false);
    }
  };

  const handleConfirmDeleteVisitorSlide = async () => {
    if (!visitorSlideToDelete || !canManageVisitorDisplay || isDeletingVisitorSlide) return;
    setIsDeletingVisitorSlide(true);
    setVisitorSlidesError(null);
    try {
      const res = await api.deleteVisitorSlide(visitorSlideToDelete.id);
      if (!res.success || !res.settings) {
        throw new Error(res.error || 'تعذر حذف الصورة');
      }
      setVisitorSlides(
        Array.isArray(res.settings.slides) ? [...res.settings.slides] : []
      );
      setVisitorSlideToDelete(null);
    } catch (err: any) {
      setVisitorSlidesError(err?.message || 'تعذر حذف الصورة');
      setVisitorSlideToDelete(null);
    } finally {
      setIsDeletingVisitorSlide(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'integration') {
      void loadDatabaseAndBackupInfo();
    }
  }, [activeTab, canManageIntegration, canManageBackup]);

  useEffect(() => {
    const scrollToBackupIfRequested = () => {
      const hasBackupHash = typeof window !== 'undefined' && window.location.hash === '#backup';
      if (activeTab === 'integration' && canManageBackup && (initialTab === 'backup' || hasBackupHash)) {
        window.setTimeout(() => {
          backupSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    };
    scrollToBackupIfRequested();
    window.addEventListener('hashchange', scrollToBackupIfRequested);
    return () => window.removeEventListener('hashchange', scrollToBackupIfRequested);
  }, [activeTab, initialTab, canManageBackup]);

  const handleCheckDatabase = async () => {
    setIsCheckingDb(true);
    setDbActionError(null);
    try {
      const res = await api.checkDatabase();
      setDbCheckResult(res);
      await loadDatabaseAndBackupInfo();
    } catch (err: any) {
      setDbActionError(err?.message || 'تعذر فحص قاعدة البيانات');
    } finally {
      setIsCheckingDb(false);
    }
  };

  const handleCopyDatabaseSetupSql = async () => {
    setIsCopyingSetupSql(true);
    setDbActionError(null);
    try {
      const sqlText = await api.getDatabaseSetupSql();
      await navigator.clipboard.writeText(sqlText);
      setSetupSqlCopied(true);
      window.setTimeout(() => setSetupSqlCopied(false), 3000);
    } catch (err: any) {
      setDbActionError(err?.message || 'تعذر نسخ كود التهيئة');
    } finally {
      setIsCopyingSetupSql(false);
    }
  };

  const downloadBackupNow = async (): Promise<boolean> => {
    setIsExportingBackup(true);
    setBackupSectionFeedback(null);
    try {
      const { blob, fileName } = await api.exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupSectionFeedback({
        type: 'success',
        message: `تم تنزيل النسخة الاحتياطية (${fileName}) بنجاح`
      });
      await loadDatabaseAndBackupInfo();
      return true;
    } catch (err: any) {
      setBackupSectionFeedback({
        type: 'error',
        message: err?.message || 'تعذر تنزيل النسخة الاحتياطية'
      });
      return false;
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    setRestoreError(null);
    setRestoreSuccessMessage(null);
    setInspectedBackup(null);
    setRestoreStage('select');
    setRestorePassword('');
    setRestoreConfirmText('');

    const MAX_RESTORE_BYTES = 11 * 1024 * 1024;
    if (file.size > MAX_RESTORE_BYTES) {
      setRestoreError('الملف أكبر من الحد المسموح للاسترجاع من الواجهة');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.gz')) {
      setRestoreError('يرجى اختيار ملف نسخة احتياطية مضغوط بامتداد (.gz)');
      return;
    }

    setIsInspectingBackup(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('تعذر قراءة الملف المحدد'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
      const res = await api.inspectBackup(base64);
      setRestoreFileBase64(base64);
      setRestoreFileName(file.name);
      setInspectedBackup({
        summary: res.summary,
        currentTenant: res.currentTenant,
        tenantMismatch: res.tenantMismatch
      });
      setRestoreStage('summary');
    } catch (err: any) {
      setRestoreError(err?.message || 'تعذر قراءة ملف النسخة الاحتياطية');
    } finally {
      setIsInspectingBackup(false);
    }
  };

  const handleProceedToRestoreConfirm = async () => {
    setRestoreError(null);
    setIsTakingPreRestoreBackup(true);
    try {
      const ok = await downloadBackupNow();
      if (!ok) {
        setRestoreError('تعذر تنزيل نسخة احتياطية من الوضع الحالي قبل الاسترجاع — تم إيقاف المتابعة');
        return;
      }
      setRestoreStage('confirm');
    } finally {
      setIsTakingPreRestoreBackup(false);
    }
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestoreError(null);
    setIsRestoringBackup(true);
    try {
      await api.restoreBackup({
        fileBase64: restoreFileBase64,
        password: restorePassword,
        confirmText: restoreConfirmText
      });
      setRestoreSuccessMessage('تم استرجاع النسخة. سجّل الدخول من جديد');
      window.setTimeout(() => {
        setAuthToken(null);
        localStorage.removeItem('pos_user');
        if (onLogout) {
          onLogout();
        } else {
          window.location.reload();
        }
      }, 1500);
    } catch (err: any) {
      setRestoreError(err?.message || 'تعذر استرجاع النسخة الاحتياطية');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  // User Management & Cashbox Modal State
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserAccount | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [userActionFeedback, setUserActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [statusToggleLoadingId, setStatusToggleLoadingId] = useState<string | null>(null);

  useEffect(() => {
    api.getCashboxes().then((res) => {
      if (res.success && res.cashboxes) setCashboxes(res.cashboxes);
    }).catch(() => {});
  }, []);

  const handleOpenCreateUser = () => {
    setUserToEdit(null);
    setIsUserModalOpen(true);
    setUserActionFeedback(null);
  };

  const handleOpenEditUser = (user: UserAccount) => {
    setUserToEdit(user);
    setIsUserModalOpen(true);
    setUserActionFeedback(null);
  };

  const handleSaveUserFromModal = async (userData: any): Promise<{ success: boolean; user?: UserAccount; error?: string }> => {
    try {
      const res = await api.saveUser(userData);
      if (res.success && res.user) {
        setUserActionFeedback({
          type: 'success',
          message: `تم حفظ وتحديث بيانات وصلاحيات وخزائن المستخدم (${res.user.name}) بنجاح!`
        });
        await onSyncAll();
        return { success: true, user: res.user };
      } else {
        return { success: false, error: (res as any).error || 'فشل حفظ المستخدم' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'حدث خطأ أثناء حفظ المستخدم في النظام' };
    }
  };

  const handleToggleUserStatus = async (user: UserAccount) => {
    const isCurrentlyActive = user.status === 'active' || (user.status as any) === 'نشط';
    const nextStatus = isCurrentlyActive ? 'موقوف' : 'نشط';
    const actionLabel = isCurrentlyActive ? 'إيقاف وتعطيل' : 'تنشيط وتفعيل';

    if (user.role === 'designer' && isCurrentlyActive) {
      const activeDesigners = users.filter(
        (u) => u.role === 'designer' && (u.status === 'active' || (u.status as any) === 'نشط')
      );
      if (activeDesigners.length <= 1) {
        setUserActionFeedback({
          type: 'error',
          message: 'لا يمكن إيقاف حساب مصمم النظام الأخير! يجب أن يظل هناك مصمم واحد نشط على الأقل لحماية إدارة المنظومة.'
        });
        return;
      }
    }

    setStatusToggleLoadingId(user.id);
    setUserActionFeedback(null);
    try {
      const res = await api.saveUser({
        id: user.id,
        username: user.username,
        status: nextStatus
      });
      if (res.success) {
        setUserActionFeedback({
          type: 'success',
          message: `تم ${isCurrentlyActive ? 'إيقاف' : 'تنشيط'} حساب المستخدم (${user.name}) وإنهاء جلساته فورياً!`
        });
        await onSyncAll();
      } else {
        setUserActionFeedback({
          type: 'error',
          message: (res as any).error || `فشل ${actionLabel} المستخدم`
        });
      }
    } catch (err: any) {
      setUserActionFeedback({
        type: 'error',
        message: err.message || `فشل ${actionLabel} المستخدم`
      });
    } finally {
      setStatusToggleLoadingId(null);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    setUserActionFeedback(null);
    try {
      const res = await api.deleteUser(userToDelete.id);
      if (res.success) {
        setUserActionFeedback({
          type: 'success',
          message: res.message || `تم حذف حساب المستخدم (${userToDelete.name}) بنجاح`
        });
        setUserToDelete(null);
        await onSyncAll();
      } else {
        setUserActionFeedback({
          type: 'error',
          message: res.error || 'تعذر حذف المستخدم'
        });
        setUserToDelete(null);
      }
    } catch (err: any) {
      setUserActionFeedback({
        type: 'error',
        message: err?.message || 'تعذر حذف المستخدم'
      });
      setUserToDelete(null);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.phone && u.phone.toLowerCase().includes(q))
    );
  });

  // Header Image Upload (Page 5 Print)
  const handleHeaderImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingHeaderImage(true);
      setHeaderImageStatus('جاري ضغط ومعالجة الصورة في المتصفح...');
      const resized = await resizeHeaderImage(file, 576, 300, 300 * 1024);
      setHeaderImageStatus(`جاري رفع صورة الهيدر (${resized.sizeKb} ك.ب)...`);

      const uploadRes = await api.uploadImage({
        imageBase64: resized.base64,
        fileName: resized.fileName,
        mimeType: resized.mimeType,
        folder: 'print'
      });

      const finalUrl = uploadRes.success && uploadRes.url ? uploadRes.url : resized.base64;
      setInvoiceSettings((prev) => ({
        ...prev,
        headerImageUrl: finalUrl,
        showHeaderImage: true
      }));
      setHeaderImageStatus('تم رفع صورة الهيدر وتفعيل ظهورها بنجاح — اضغط «حفظ» للتأكيد.');
    } catch (err: any) {
      setHeaderImageStatus(err.message || 'فشلت معالجة أو رفع الصورة');
    } finally {
      setIsUploadingHeaderImage(false);
      setTimeout(() => setHeaderImageStatus(null), 3500);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveHeaderImage = () => {
    setInvoiceSettings((prev) => ({
      ...prev,
      headerImageUrl: '',
      showHeaderImage: false
    }));
    setHeaderImageStatus('تمت إزالة صورة الهيدر — اضغط «حفظ» للتأكيد.');
    setTimeout(() => setHeaderImageStatus(null), 2500);
  };

  // Keyboard Shortcuts (Page 9 — immediate save)
  const { setIsCapturing } = useKeyboardShortcuts();
  const [shortcutsSettings, setShortcutsSettings] = useState<KeyboardShortcutsSettings>(() =>
    resolveKeyboardShortcutsSettings(
      config.displaySettings?.keyboardShortcuts ?? config.companySettings?.keyboardShortcuts
    )
  );
  const [capturingActionId, setCapturingActionId] = useState<KeyboardShortcutActionId | null>(null);
  const [isSavingShortcuts, setIsSavingShortcuts] = useState(false);
  const [shortcutsFeedback, setShortcutsFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    const raw =
      config.displaySettings?.keyboardShortcuts ?? config.companySettings?.keyboardShortcuts;
    if (raw) {
      setShortcutsSettings(resolveKeyboardShortcutsSettings(raw));
    }
  }, [config.displaySettings?.keyboardShortcuts, config.companySettings?.keyboardShortcuts]);

  useEffect(() => {
    setIsCapturing(Boolean(capturingActionId));
    return () => {
      setIsCapturing(false);
    };
  }, [capturingActionId, setIsCapturing]);

  const persistKeyboardShortcuts = async (
    nextShortcuts: KeyboardShortcutsSettings,
    successMessage: string
  ) => {
    setShortcutsSettings(nextShortcuts);
    onUpdateKeyboardShortcuts?.(nextShortcuts);
    setDisplaySettings((prev) => ({ ...prev, keyboardShortcuts: nextShortcuts }));
    setCompanySettings((prev) => ({ ...prev, keyboardShortcuts: nextShortcuts }));
    setIsSavingShortcuts(true);
    try {
      const promises: Promise<any>[] = [];
      if (canManageDisplay || (!canManageCompany && canManageShortcuts)) {
        promises.push(
          api.saveDisplaySettings({
            ...committedDisplay,
            keyboardShortcuts: nextShortcuts
          })
        );
      }
      if (canManageCompany) {
        promises.push(
          api.saveCompanySettings({
            ...committedCompany,
            keyboardShortcuts: nextShortcuts
          })
        );
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      setShortcutsFeedback({ type: 'success', message: successMessage });
      await onSyncAll();
    } catch (err: any) {
      setShortcutsFeedback({
        type: 'error',
        message: err?.message || 'تعذر حفظ إعدادات اختصارات لوحة المفاتيح'
      });
    } finally {
      setIsSavingShortcuts(false);
    }
  };

  useEffect(() => {
    if (!capturingActionId) return;

    const handleCaptureKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (
        (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape') &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.metaKey
      ) {
        setCapturingActionId(null);
        return;
      }

      const formatted = formatKeyboardEventToKey(e);
      if (!formatted) return;

      const validation = validateShortcutKeyAssignment(
        capturingActionId,
        formatted,
        shortcutsSettings
      );

      if (!validation.valid) {
        setCapturingActionId(null);
        setShortcutsFeedback({
          type: 'error',
          message: validation.error || 'هذا المفتاح غير متاح'
        });
        return;
      }

      const targetDef = SHORTCUT_DEFINITION_MAP[capturingActionId];
      const nextShortcuts: KeyboardShortcutsSettings = {
        ...shortcutsSettings,
        bindings: {
          ...shortcutsSettings.bindings,
          [capturingActionId]: {
            ...shortcutsSettings.bindings[capturingActionId],
            key: validation.normalizedKey
          }
        }
      };
      setCapturingActionId(null);
      void persistKeyboardShortcuts(
        nextShortcuts,
        `تم تعيين المفتاح «${validation.normalizedKey}» لإجراء «${targetDef?.label || ''}» بنجاح.`
      );
    };

    window.addEventListener('keydown', handleCaptureKeyDown, true);
    return () => window.removeEventListener('keydown', handleCaptureKeyDown, true);
  }, [capturingActionId, shortcutsSettings, committedDisplay, committedCompany]);

  const handleToggleMasterShortcuts = () => {
    if (!canManageShortcuts || isSavingShortcuts) return;
    setCapturingActionId(null);
    const nextEnabled = !shortcutsSettings.enabled;
    const nextShortcuts: KeyboardShortcutsSettings = {
      ...shortcutsSettings,
      enabled: nextEnabled
    };
    void persistKeyboardShortcuts(
      nextShortcuts,
      nextEnabled
        ? 'تم تفعيل اختصارات لوحة المفاتيح في البرنامج.'
        : 'تم إيقاف اختصارات لوحة المفاتيح في البرنامج.'
    );
  };

  const handleToggleSingleShortcut = (actionId: KeyboardShortcutActionId) => {
    if (!canManageShortcuts || isSavingShortcuts) return;
    setCapturingActionId(null);
    const currentBinding = shortcutsSettings.bindings[actionId];
    const targetDef = SHORTCUT_DEFINITION_MAP[actionId];
    const nextEnabled = !currentBinding?.enabled;
    const nextShortcuts: KeyboardShortcutsSettings = {
      ...shortcutsSettings,
      bindings: {
        ...shortcutsSettings.bindings,
        [actionId]: {
          key: currentBinding?.key || targetDef.defaultKey,
          enabled: nextEnabled
        }
      }
    };
    void persistKeyboardShortcuts(
      nextShortcuts,
      nextEnabled
        ? `تم تفعيل اختصار «${targetDef.label}» (${currentBinding?.key || targetDef.defaultKey}).`
        : `تم إيقاف اختصار «${targetDef.label}».`
    );
  };

  const handleResetShortcutsToDefault = () => {
    if (!canManageShortcuts || isSavingShortcuts) return;
    setCapturingActionId(null);
    const defaults = getDefaultKeyboardShortcutsSettings();
    void persistKeyboardShortcuts(
      defaults,
      'تمت استعادة الإعدادات الافتراضية لجميع اختصارات لوحة المفاتيح.'
    );
  };

  // Fallback tab resolution when initialTab omitted
  useEffect(() => {
      if (!initialTab) {
      const firstAllowed: CanonicalSettingsTab = canManageCompany
        ? 'company'
        : canManageUiScale || canManageDisplay
        ? 'appearance'
        : canManageSalesRules
        ? 'sales'
        : canManageVisitorDisplay
        ? 'visitor'
        : canManageNegativeStock
        ? 'stock'
        : canManagePrint || canManageInvoiceNumbering
        ? 'print'
        : canManageLabelPrint
        ? 'labels'
        : canManageBankLink
        ? 'bank_link'
        : canManageIntegration || canManageBackup || canManageReset
        ? 'integration'
        : canManageUsers
        ? 'users'
        : 'company';
      setActiveTab(firstAllowed);
    }
  }, [
    initialTab,
    canManageCompany,
    canManageUiScale,
    canManageDisplay,
    canManageSalesRules,
    canManageVisitorDisplay,
    canManageNegativeStock,
    canManagePrint,
    canManageLabelPrint,
    canManageBankLink,
    canManageIntegration,
    canManageBackup,
    canManageReset,
    canManageUsers
  ]);

  const renderSettingRow = (
    label: React.ReactNode,
    description: React.ReactNode | null,
    control: React.ReactNode,
    htmlFor?: string
  ) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-3 border-b border-[var(--border-subtle)]">
      <div className="min-w-0 max-w-xl">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-xs font-bold text-[var(--text-primary)]">
            {label}
          </label>
        ) : (
          <div className="text-xs font-bold text-[var(--text-primary)]">{label}</div>
        )}
        {description && (
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 flex flex-wrap items-center gap-2">{control}</div>
    </div>
  );

  const settingsHeaderMeta: Record<CanonicalSettingsTab, { title: string; subtitle: string }> = {
    company: {
      title: 'بيانات المنشأة',
      subtitle: 'هوية المنشأة، البيانات الضريبية، وأرقام التواصل في صفحة تسجيل الدخول'
    },
    appearance: {
      title: 'المظهر والحجم',
      subtitle: 'الثيمات، الخط، المؤثرات الحركية، مقاسات الواجهة على هذا الجهاز، وخيارات العرض المشتركة'
    },
    sales: {
      title: 'البيع ونقطة البيع',
      subtitle: 'إعدادات البيع وقواعد السعر، الافتراضيات عند فتح شاشة البيع، وخيارات الفاتورة'
    },
    visitor: {
      title: 'شاشة الزوار',
      subtitle: 'صور العرض المتقلّبة واستعلام الزبون عن سعر المنتج بالباركود'
    },
    stock: {
      title: 'الأصناف والمخزون',
      subtitle: 'سياسة البيع والتحويل بالسالب وإعدادات عرض الأصناف في دليل وجدول المخزون'
    },
    print: {
      title: 'الفواتير والطباعة',
      subtitle: 'مقاس ورق الإيصال، البيانات المطبوعة، ومعاينة الفاتورة المباشرة'
    },
    labels: {
      title: 'طابعة الباركود',
      subtitle: 'مقاس تكت الباركود، الورق والهوامش، ترتيب العناصر، ومعاينة التكت بالمقاس الحقيقي'
    },
    tax: {
      title: 'الضريبة والعمولة',
      subtitle: 'سياسة شمول الضريبة وطريقة احتساب عمولة المنصات'
    },
    bank_link: {
      title: 'الخزن المربوطة بالبنك',
      subtitle: 'ربط خزن النظام بحسابات البنك والمحافظ وإنستا باي عبر رسائل الهاتف ومطابقة الأرصدة تلقائيًا'
    },
    integration: {
      title:
        canManageIntegration && canManageBackup
          ? 'قاعدة البيانات والنسخ الاحتياطي'
          : canManageBackup && !canManageIntegration && canManageReset
          ? 'النسخ الاحتياطي وإعادة الضبط'
          : canManageBackup && !canManageIntegration
          ? 'النسخ الاحتياطي'
          : !canManageIntegration && !canManageBackup && canManageReset
          ? 'إعادة الضبط'
          : 'قاعدة البيانات',
      subtitle:
        canManageIntegration && canManageBackup
          ? 'حالة الاتصال بقاعدة البيانات وفحص التهيئة وتنزيل واسترجاع النسخ الاحتياطية'
          : canManageBackup && !canManageIntegration
          ? 'تنزيل نسخة احتياطية كاملة من بيانات الشركة واسترجاعها بأمان'
          : !canManageIntegration && !canManageBackup && canManageReset
          ? 'إعادة ضبط العمليات أو إعادة ضبط المصنع مع التحقق والتأكيد الكامل'
          : 'حالة الاتصال بقاعدة البيانات وفحص التهيئة وكود الإعداد'
    },
    shortcuts: {
      title: 'اختصارات لوحة المفاتيح',
      subtitle: 'إدارة اختصارات لوحة المفاتيح العامة للبرنامج كله وتخصيص المفاتيح وحالتها'
    },
    users: {
      title: `إدارة المستخدمين (${users.length})`,
      subtitle: 'إدارة حسابات المستخدمين والأدوار وتعيينات الخزائن'
    }
  };

  const currentSettingsMeta = settingsHeaderMeta[activeTab] || settingsHeaderMeta.company;

  const renderUiScaleSection = (withTopDivider = false) => {
    if (!canManageUiScale) return null;
    return (
      <div id="settings-ui-scale-section" className="space-y-4">
        <SectionHeading
          title="حجم وشكل الواجهة"
          withTopDivider={withTopDivider}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold ui-link">على هذا الجهاز فقط</span>
              <button
                type="button"
                onClick={handleResetUiPrefs}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-xs font-bold text-[var(--text-primary)] transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>الرجوع للافتراضي</span>
              </button>
            </div>
          }
        />

        <p className="text-xs text-[var(--text-secondary)]">
          هذه الإعدادات لهذا الجهاز فقط — كل تغيير يظهر فورًا كمعاينة مباشرة، ويُحفظ بزر «حفظ» للتأكيد.
        </p>

        <div>
          {renderSettingRow(
            'حجم البرنامج',
            'تكبير أو تصغير صفحات البرنامج كلها (الخط والأيقونات والمسافات والقائمة الرئيسية) خارج شاشة نقطة البيع.',
            <div className="flex flex-wrap items-center gap-1.5">
              {UI_SCALE_OPTIONS.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => handleUpdateUiPrefs({ appScale: sc })}
                  className={`min-h-[40px] px-3 rounded-lg font-mono text-xs font-bold border transition cursor-pointer ${
                    uiPrefs.appScale === sc
                      ? 'bg-[#1668B2] border-[#1668B2] text-white'
                      : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  {formatScale(sc)}
                </button>
              ))}
            </div>
          )}

          {renderSettingRow(
            'حجم نقطة البيع',
            'تكبير أو تصغير شاشة نقطة البيع بشكل منفصل عن باقي صفحات البرنامج.',
            <div className="flex flex-wrap items-center gap-1.5">
              {UI_SCALE_OPTIONS.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => handleUpdateUiPrefs({ posScale: sc })}
                  className={`min-h-[40px] px-3 rounded-lg font-mono text-xs font-bold border transition cursor-pointer ${
                    uiPrefs.posScale === sc
                      ? 'bg-[#1668B2] border-[#1668B2] text-white'
                      : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  {formatScale(sc)}
                </button>
              ))}
            </div>
          )}

          {renderSettingRow(
            'عرض لوحة الفاتورة',
            'التحكم في عرض لوحة الفاتورة في شاشة نقطة البيع (ضيقة 380px / وسط 460px / عريضة 560px).',
            <div className="flex flex-wrap items-center gap-1.5">
              {(['narrow', 'medium', 'wide'] as PosPanelWidth[]).map((wKey) => (
                <button
                  key={wKey}
                  type="button"
                  onClick={() => handleUpdateUiPrefs({ posPanelWidth: wKey })}
                  className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    uiPrefs.posPanelWidth === wKey
                      ? 'bg-[#1668B2] border-[#1668B2] text-white'
                      : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  {POS_PANEL_WIDTH_LABELS[wKey]}
                </button>
              ))}
            </div>
          )}

          {renderSettingRow(
            'حجم كروت الأصناف',
            'ضبط حجم بطاقات الأصناف في شاشة نقطة البيع لإظهار أصناف أكثر في الصف الواحد أو تكبيرها.',
            <div className="flex flex-wrap items-center gap-1.5">
              {(['small', 'medium', 'large'] as PosSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleUpdateUiPrefs({ posCardSize: sz })}
                  className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    uiPrefs.posCardSize === sz
                      ? 'bg-[#1668B2] border-[#1668B2] text-white'
                      : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  {POS_SIZE_LABELS[sz]}
                </button>
              ))}
            </div>
          )}

          {renderSettingRow(
            'حجم التصنيفات',
            'ضبط ارتفاع وحجم خط أزرار التصنيفات في شاشة نقطة البيع.',
            <div className="flex flex-wrap items-center gap-1.5">
              {(['small', 'medium', 'large'] as PosSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => handleUpdateUiPrefs({ posCategorySize: sz })}
                  className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    uiPrefs.posCategorySize === sz
                      ? 'bg-[#1668B2] border-[#1668B2] text-white'
                      : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  {POS_SIZE_LABELS[sz]}
                </button>
              ))}
            </div>
          )}

          {renderSettingRow(
            'بدون إطارات (الصفحة قطعة واحدة)',
            'إزالة الإطارات والظلال الخارجية عن حاويات نقطة البيع لتبدو الشاشة كسطح واحد نظيف.',
            <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
              <input
                type="checkbox"
                checked={uiPrefs.posFrameless}
                onChange={(e) => handleUpdateUiPrefs({ posFrameless: e.target.checked })}
                aria-label="بدون إطارات (الصفحة قطعة واحدة)"
                className="w-4 h-4 accent-[#1668B2] cursor-pointer"
              />
            </label>
          )}
        </div>
      </div>
    );
  };

  const renderOfflineBackupSection = () => (
    <div className="space-y-2">
      <SectionHeading title="النسخ الاحتياطي المحلي على الجهاز" withTopDivider />
      {renderSettingRow(
        'النسخ الاحتياطي التلقائي للعمليات أوفلاين وحماية البيانات المحلية',
        <>
          حفظ تلقائي لكل عملية أوفلاين في ملف اليوم{' '}
          <span className="font-mono font-bold text-[var(--text-primary)]">
            {getBackupJsonlFileName()}
          </span>{' '}
          قبل الطباعة (على متصفحات Chrome و Edge للكمبيوتر).
          {backupDirStatus && (
            <span className="block mt-1 font-semibold">
              {backupDirStatus.configured
                ? `المجلد المختار: ${backupDirStatus.directoryName} • ${
                    backupDirStatus.permission === 'granted'
                      ? 'الإذن مفعّل'
                      : 'الإذن متوقف مؤقتًا بعد إعادة تشغيل المتصفح'
                  }`
                : backupDirStatus.supported
                ? 'لم يتم اختيار مجلد نسخ احتياطي بعد'
                : 'المتصفح الحالي لا يدعم اختيار مجلد مباشر — يتم تنزيل ملف احتياطي تلقائيًا مع كل تنبيه ساعة'}
              {storageQuota && storageQuota.quota > 0
                ? ` • مساحة التخزين المستخدمة: ${storageQuota.usagePercent}%`
                : ''}
            </span>
          )}
        </>,
        <>
          {backupDirStatus?.needsActivationBanner && (
            <button
              type="button"
              onClick={handleActivateBackupDirectory}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs transition cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>فعّل النسخ الاحتياطي</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleChooseBackupDirectory}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#1668B2] hover:bg-[#125491] text-white font-bold text-xs transition cursor-pointer"
          >
            <FolderOpen className="w-4 h-4" />
            <span>اختيار مجلد النسخ الاحتياطي</span>
          </button>

          <button
            type="button"
            onClick={handleClearLocalAppData}
            disabled={isClearingLocalData}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] ui-stock-out font-bold text-xs transition cursor-pointer disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" />
            <span>مسح بيانات التطبيق</span>
          </button>
        </>
      )}

      {backupFeedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 py-2 border-b border-[var(--border-subtle)] text-xs font-bold ${
            backupFeedback.type === 'success' ? 'ui-money-purchase' : 'ui-stock-out'
          }`}
        >
          <div className="flex items-center gap-2">
            {backupFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{backupFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBackupFeedback(null)}
            className="min-h-[44px] px-2 text-xs underline cursor-pointer shrink-0"
          >
            إغلاق
          </button>
        </div>
      )}
    </div>
  );

  return (
    <PageSurface
      dir="rtl"
      title={currentSettingsMeta.title}
      subtitle={currentSettingsMeta.subtitle}
    >
      {/* 1) صفحة: بيانات المنشأة */}
      {activeTab === 'company' && canManageCompany && (
        <div className="space-y-6">
          <SectionHeading title="هوية المنشأة" />
          <div>
            {renderSettingRow(
              'اسم المنشأة / المتجر',
              'الاسم التجاري الظاهر في الترويسة والفواتير المطبوعة.',
              <input
                id="company-store-name"
                type="text"
                value={companySettings.storeName}
                onChange={(e) => setCompanySettings({ ...companySettings, storeName: e.target.value })}
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.name} text-xs font-semibold`}
              />,
              'company-store-name'
            )}

            {renderSettingRow(
              'الشعار النصي (Tagline)',
              'وصف مختصر يظهر أسفل اسم المتجر.',
              <input
                id="company-tagline"
                type="text"
                value={companySettings.brandTagline}
                onChange={(e) => setCompanySettings({ ...companySettings, brandTagline: e.target.value })}
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs`}
              />,
              'company-tagline'
            )}

            {renderSettingRow(
              'رابط الشعار (Logo URL)',
              'رابط صورة شعار الشركة المستخدم في المعاينة والطباعة.',
              <input
                id="company-logo-url"
                type="url"
                value={companySettings.logoUrl}
                onChange={(e) => setCompanySettings({ ...companySettings, logoUrl: e.target.value })}
                placeholder="https://..."
                dir="ltr"
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs font-mono text-left`}
              />,
              'company-logo-url'
            )}

            {renderSettingRow(
              'الرقم الضريبي',
              'رقم التسجيل الضريبي الظاهر في الإيصالات.',
              <input
                id="company-tax-number"
                type="text"
                value={companySettings.taxNumber}
                onChange={(e) => setCompanySettings({ ...companySettings, taxNumber: e.target.value })}
                placeholder="مثال: 123-456-789"
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-mono`}
              />,
              'company-tax-number'
            )}

            {renderSettingRow(
              'رقم السجل التجاري',
              'رقم السجل التجاري للمنشأة.',
              <input
                id="company-cr"
                type="text"
                value={companySettings.commercialRecord}
                onChange={(e) => setCompanySettings({ ...companySettings, commercialRecord: e.target.value })}
                placeholder="مثال: 987654"
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-mono`}
              />,
              'company-cr'
            )}

            {renderSettingRow(
              'هاتف التواصل',
              'رقم هاتف خدمة العملاء الخاص بالمتجر.',
              <input
                id="company-phone"
                type="tel"
                value={companySettings.phone}
                onChange={(e) => setCompanySettings({ ...companySettings, phone: e.target.value })}
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-mono`}
              />,
              'company-phone'
            )}

            {renderSettingRow(
              'البريد الإلكتروني',
              'البريد الرسمي للتواصل والمراسلات.',
              <input
                id="company-email"
                type="email"
                value={companySettings.email}
                onChange={(e) => setCompanySettings({ ...companySettings, email: e.target.value })}
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.name} text-xs`}
              />,
              'company-email'
            )}

            {renderSettingRow(
              'العنوان والمقر',
              'العنوان التفصيلي للفرع أو المقر الرئيسي.',
              <input
                id="company-address"
                type="text"
                value={companySettings.address}
                onChange={(e) => setCompanySettings({ ...companySettings, address: e.target.value })}
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs`}
              />,
              'company-address'
            )}
          </div>

          <SectionHeading
            title="بيانات التواصل في صفحة تسجيل الدخول"
            withTopDivider
            actions={
              <span className="text-xs text-[var(--text-secondary)]">
                الحقل الفارغ يُخفي أيقونته في شاشة الدخول
              </span>
            }
          />
          <div>
            {renderSettingRow(
              'واتساب الدعم الفني (supportWhatsapp)',
              'أرقام فقط مع علامة + اختيارية في البداية (مثال: 201012345678).',
              <input
                id="contact-support-wa"
                type="text"
                dir="ltr"
                value={contactSettings.supportWhatsapp}
                onChange={(e) => setContactSettings({ ...contactSettings, supportWhatsapp: e.target.value })}
                placeholder="201012345678"
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-mono text-left`}
              />,
              'contact-support-wa'
            )}

            {renderSettingRow(
              'هاتف الدعم الفني (supportPhone)',
              'رقم الاتصال الهاتفي للدعم الفني.',
              <input
                id="contact-support-phone"
                type="text"
                dir="ltr"
                value={contactSettings.supportPhone}
                onChange={(e) => setContactSettings({ ...contactSettings, supportPhone: e.target.value })}
                placeholder="+201012345678"
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-mono text-left`}
              />,
              'contact-support-phone'
            )}

            {renderSettingRow(
              'واتساب المبيعات (salesWhatsapp)',
              'رقم واتساب المبيعات والاشتراكات.',
              <input
                id="contact-sales-wa"
                type="text"
                dir="ltr"
                value={contactSettings.salesWhatsapp}
                onChange={(e) => setContactSettings({ ...contactSettings, salesWhatsapp: e.target.value })}
                placeholder="201098765432"
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-mono text-left`}
              />,
              'contact-sales-wa'
            )}

            {renderSettingRow(
              'هاتف المبيعات (salesPhone)',
              'رقم الاتصال الهاتفي للمبيعات.',
              <input
                id="contact-sales-phone"
                type="text"
                dir="ltr"
                value={contactSettings.salesPhone}
                onChange={(e) => setContactSettings({ ...contactSettings, salesPhone: e.target.value })}
                placeholder="+201098765432"
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-mono text-left`}
              />,
              'contact-sales-phone'
            )}
          </div>
        </div>
      )}

      {/* 2) صفحة: المظهر والحجم */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          {canManageCompany && (
            <>
              <SectionHeading
                title="الثيمات"
                actions={
                  <span className="text-xs text-[var(--text-secondary)]">
                    معاينة مباشرة على الواجهة عند الاختيار — اضغط «حفظ» للاعتماد
                  </span>
                }
              />

              <div role="radiogroup" aria-label="اختيار الثيم" className="divide-y divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
                {THEME_OPTIONS.map((th) => {
                  const isSelected = previewTheme === th.id;
                  const isCurrentSaved = appliedTheme === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handlePreviewTheme(th.id)}
                      className="w-full text-right min-h-[52px] py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--surface-subtle)] transition cursor-pointer"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <span
                          className={`mt-1 sm:mt-0 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            isSelected
                              ? 'border-[var(--primary-on-white,var(--primary))]'
                              : 'border-[var(--border-color)]'
                          }`}
                        >
                          {isSelected && (
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: 'var(--primary-on-white, var(--primary))' }}
                            />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-primary)]">{th.nameAr}</span>
                            <span className="text-[11px] text-[var(--text-secondary)]">• {th.badgeAr}</span>
                            {isCurrentSaved && (
                              <span className="text-[11px] font-bold ui-money-purchase">
                                — المستخدم حاليًا
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                            {th.taglineAr}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pr-7 sm:pr-0">
                        {th.swatches.slice(0, 6).map((sw, idx) => (
                          <span
                            key={idx}
                            className="w-4 h-4 rounded-sm border border-[var(--border-color)]"
                            style={{ backgroundColor: sw.hex }}
                            title={`${sw.name}: ${sw.hex}`}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <SectionHeading title="الخط والحركة" withTopDivider />
              <div>
                {renderSettingRow(
                  'نوع الخط المعتمد',
                  'الخط الأساسي لواجهات النظام والتقارير (تظهر المعاينة فورًا).',
                  <select
                    id="company-font-family"
                    value={companySettings.fontFamily}
                    onChange={(e) => {
                      const nextFont = e.target.value;
                      setCompanySettings({ ...companySettings, fontFamily: nextFont });
                      applyFontPreview(nextFont);
                    }}
                    className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.name} text-xs`}
                  >
                    <option value="Tajawal">Tajawal (تجوال - موصى به)</option>
                    <option value="Cairo">Cairo (القاهرة)</option>
                    <option value="sans-serif">النظام الافتراضي (Sans-serif)</option>
                  </select>,
                  'company-font-family'
                )}

                {renderSettingRow(
                  'المؤثرات الحركية',
                  'تشغيل أو إيقاف الحركات الانتقالية الهادئة للأزرار والقوائم والنوافذ.',
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                      {currentMotion === 'on' ? 'مفعّلة (120-220ms)' : 'متوقفة (0s)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleMotion(currentMotion === 'on' ? 'off' : 'on')}
                      role="switch"
                      aria-checked={currentMotion === 'on'}
                      aria-label="المؤثرات الحركية"
                      className="min-h-[44px] inline-flex items-center px-1 cursor-pointer"
                    >
                      <span
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          currentMotion === 'on' ? 'bg-cyan-700' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            currentMotion === 'on' ? 'translate-x-0' : '-translate-x-5'
                          }`}
                        />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMotionTestModalOpen(true)}
                      className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>تجربة حركة تفاعلية</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {renderUiScaleSection(canManageCompany)}

          {canManageDisplay && (
            <div className="space-y-4">
              <SectionHeading
                title="إعدادات العرض المشتركة — على النسخة كلها"
                withTopDivider={canManageCompany || canManageUiScale}
              />
              <div>
                {renderSettingRow(
                  'إظهار صور الأصناف',
                  'عرض المعاينة المصغرة للمنتج في بطاقات البيع (على النسخة كلها).',
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={displaySettings.showItemImages}
                      onChange={(e) => {
                        const nextVal = e.target.checked;
                        setDisplaySettings({ ...displaySettings, showItemImages: nextVal });
                        applyUiPrefs(uiPrefs, false, document.documentElement, {
                          showItemImages: nextVal,
                          posLayout: displaySettings.posLayout
                        });
                      }}
                      aria-label="إظهار صور الأصناف"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                )}

                {renderSettingRow(
                  'عرض الأصناف: كروت / قائمة',
                  'اختيار طريقة عرض الأصناف في نقطة البيع كشبكة بطاقات أو قائمة سطور مضغوطة (على النسخة كلها).',
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['grid', 'list'] as const).map((layoutMode) => {
                      const isSelected = (displaySettings.posLayout === 'list' ? 'list' : 'grid') === layoutMode;
                      return (
                        <button
                          key={layoutMode}
                          type="button"
                          onClick={() => {
                            setDisplaySettings({ ...displaySettings, posLayout: layoutMode });
                            applyUiPrefs(uiPrefs, false, document.documentElement, {
                              showItemImages: displaySettings.showItemImages,
                              posLayout: layoutMode
                            });
                          }}
                          className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#1668B2] border-[#1668B2] text-white'
                              : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                          }`}
                        >
                          {layoutMode === 'grid' ? 'كروت' : 'قائمة'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3) صفحة: البيع ونقطة البيع */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {canManageSalesRules && (
            <div id="settings-sales-rules-section" className="space-y-6">
              <SectionHeading title="الافتراضيات عند فتح شاشة البيع" />

              {salesRules.defaultPlatformMissing && (
                <div
                  role="alert"
                  className="flex items-center gap-2 py-1 text-xs font-bold ui-stock-low"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>المنصة المحددة حُذفت أو أُوقفت — شاشة البيع ستطلب اختيار المنصة باليد حتى تختار غيرها</span>
                </div>
              )}

              {salesRules.defaultCustomerMissing && (
                <div
                  role="alert"
                  className="flex items-center gap-2 py-1 text-xs font-bold ui-stock-low"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>العميل المحدد حُذف أو أُوقف — شاشة البيع ستطلب اختيار العميل باليد حتى تختار غيره</span>
                </div>
              )}

              <div>
                {renderSettingRow(
                  'وضع البيع عند فتح شاشة البيع',
                  'تحديد الوضع الافتراضي الذي تفتح عليه شاشة البيع (POS).',
                  <div className="flex flex-wrap items-center gap-1.5">
                    {([
                      { id: 'last', label: 'آخر وضع استخدمه المستخدم' },
                      { id: 'direct', label: 'بيع مباشر' },
                      { id: 'platform', label: 'بيع منصات' }
                    ] as { id: DefaultSaleMode; label: string }[]).map((opt) => {
                      const active = salesRules.defaultSaleMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setSalesRules((prev) => ({ ...prev, defaultSaleMode: opt.id }))
                          }
                          className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                            active
                              ? 'bg-[#1668B2] border-[#1668B2] text-white'
                              : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {renderSettingRow(
                  'المنصة في بيع المنصات',
                  'تحديد المنصة المختارة تلقائيًا عند الفتح وبعد حفظ كل فاتورة في وضع بيع المنصات.',
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {([
                        { id: 'first', label: 'أول منصة نشطة' },
                        { id: 'fixed', label: 'منصة محددة' },
                        { id: 'manual', label: 'لازم يختار بإيده' }
                      ] as { id: DefaultSelectionMode; label: string }[]).map((opt) => {
                        const active = salesRules.platformSelection === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setSalesRules((prev) => ({
                                ...prev,
                                platformSelection: opt.id,
                                defaultPlatformMissing: false
                              }))
                            }
                            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {salesRules.platformSelection === 'fixed' && (
                      <select
                        value={salesRules.defaultPlatformId}
                        onChange={(e) =>
                          setSalesRules((prev) => ({
                            ...prev,
                            defaultPlatformId: e.target.value,
                            defaultPlatformMissing: false
                          }))
                        }
                        aria-label="اختيار المنصة المحددة"
                        className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.name} text-xs font-bold`}
                      >
                        <option value="">اختر المنصة...</option>
                        {salesRulesPlatforms
                          .filter(
                            (p) =>
                              p.id !== 'direct' &&
                              p.name !== 'البيع المباشر' &&
                              p.status !== 'موقوفة' &&
                              (p.status as any) !== 'inactive' &&
                              !(p as any).isArchived
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )}

                {renderSettingRow(
                  'العميل في البيع المباشر',
                  'تحديد العميل المختار تلقائيًا عند الفتح وبعد حفظ كل فاتورة في وضع البيع المباشر.',
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {([
                        { id: 'none', label: 'بدون عميل' },
                        { id: 'fixed', label: 'عميل محدد' },
                        { id: 'manual', label: 'لازم يختار بإيده' }
                      ] as { id: DefaultCustomerSelectionMode; label: string }[]).map((opt) => {
                        const active = salesRules.customerSelection === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setSalesRules((prev) => ({
                                ...prev,
                                customerSelection: opt.id,
                                defaultCustomerMissing: false
                              }))
                            }
                            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {salesRules.customerSelection === 'fixed' && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="text"
                          value={salesRulesCustomerSearch}
                          onChange={(e) => setSalesRulesCustomerSearch(e.target.value)}
                          placeholder="بحث عن عميل بالاسم أو الهاتف..."
                          aria-label="بحث عن عميل محدد"
                          className={`${FORM_CONTROL_BASE_CLASS} w-44 text-xs`}
                        />
                        <select
                          value={salesRules.defaultCustomerId}
                          onChange={(e) =>
                            setSalesRules((prev) => ({
                              ...prev,
                              defaultCustomerId: e.target.value,
                              defaultCustomerMissing: false
                            }))
                          }
                          aria-label="اختيار العميل المحدد"
                          className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.name} text-xs font-bold`}
                        >
                          <option value="">اختر العميل...</option>
                          {salesRulesCustomers
                            .filter((c) => {
                              const isActive =
                                (c as any).status !== 'موقوف' &&
                                (c as any).status !== 'inactive' &&
                                !(c as any).isArchived;
                              if (!isActive) return false;
                              const q = salesRulesCustomerSearch.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                String(c.name || '').toLowerCase().includes(q) ||
                                String(c.phone || '').toLowerCase().includes(q)
                              );
                            })
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.phone ? `(${c.phone})` : ''}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <SectionHeading title="قواعد السعر" withTopDivider />
              <div>
                {renderSettingRow(
                  'السماح بالبيع بسعر صفر',
                  'السماح بحفظ فاتورة تحتوي على صنف سعر بيعه النهائي بعد الخصم يساوي صفر.',
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={salesRules.allowZeroPriceSale}
                      onChange={(e) =>
                        setSalesRules((prev) => ({
                          ...prev,
                          allowZeroPriceSale: e.target.checked
                        }))
                      }
                      aria-label="السماح بالبيع بسعر صفر"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                )}

                {renderSettingRow(
                  'السماح بالبيع بأقل من سعر الشراء',
                  'السماح بحفظ فاتورة تحتوي على صنف سعر بيعه النهائي بعد الخصم أقل من سعر الشراء المسجل.',
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={salesRules.allowBelowCostSale}
                      onChange={(e) =>
                        setSalesRules((prev) => ({
                          ...prev,
                          allowBelowCostSale: e.target.checked
                        }))
                      }
                      aria-label="السماح بالبيع بأقل من سعر الشراء"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                )}

                {renderSettingRow(
                  'بيع المنصات دايمًا آجل على المنصة',
                  'لما يتفتح: أي بيع منصة يتسجل آجل على حساب المنصة، على كل المستخدمين حتى المالك. لو اخترت عميل في الفاتورة يفضل اسمه مكتوب فيها والآجل على المنصة. البيع المباشر ما بيتأثرش، والتحصيل زي ما هو: تختار الفواتير المدفوعة وتكتب الإجمالي المستلم.',
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(salesRules.platformAlwaysCredit)}
                      onChange={(e) =>
                        setSalesRules((prev) => ({
                          ...prev,
                          platformAlwaysCredit: e.target.checked
                        }))
                      }
                      aria-label="بيع المنصات دايمًا آجل على المنصة"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                )}
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                عند المنع: البيع المخالف يُرفض، ما عدا من معه صلاحية «تجاوز الحد الأدنى للسعر». فواتير الأوفلاين المخالفة تُقبل وتُعلَّم للمراجعة. المقارنة على سعر القطعة بعد الخصم
              </p>

              {(salesRules.updatedBy || salesRules.updatedAt) && (
                <div className="text-[11px] text-[var(--text-secondary)]">
                  آخر تعديل: {salesRules.updatedBy || '—'} —{' '}
                  {salesRules.updatedAt
                    ? new Date(salesRules.updatedAt).toLocaleString('ar-EG')
                    : '—'}
                </div>
              )}
            </div>
          )}

          {(canManageDisplay || canManagePrint || canManageCompany) && (
            <div className="space-y-4">
              <SectionHeading
                title="خيارات الفاتورة في نقطة البيع"
                withTopDivider={canManageSalesRules}
              />
              <div>
                {canManageDisplay &&
                  renderSettingRow(
                    'تأكيد الفاتورة قبل الحفظ النهائي',
                    'إظهار نافذة مراجعة وتأكيد لتجنب الخطأ في الكميات.',
                    <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={displaySettings.confirmInvoiceBeforeSave}
                        onChange={(e) =>
                          setDisplaySettings({
                            ...displaySettings,
                            confirmInvoiceBeforeSave: e.target.checked
                          })
                        }
                        aria-label="تأكيد الفاتورة قبل الحفظ النهائي"
                        className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                      />
                    </label>
                  )}

                {(canManageDisplay || canManagePrint) &&
                  renderSettingRow(
                    'تعبئة المدفوع النقدي تلقائيًا بإجمالي الفاتورة',
                    'عند التشغيل يمتلئ «مدفوع نقدي» بإجمالي الفاتورة ويتحدث تلقائيًا إلا إذا عُدّل يدويًا؛ وعند الإيقاف يبدأ من 0.00.',
                    <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={displaySettings.autoFillCashPaid ?? invoiceSettings.autoFillCashPaid ?? true}
                        onChange={(e) => {
                          setDisplaySettings({ ...displaySettings, autoFillCashPaid: e.target.checked });
                          setInvoiceSettings((prev) => ({ ...prev, autoFillCashPaid: e.target.checked }));
                        }}
                        aria-label="تعبئة المدفوع النقدي تلقائيًا بإجمالي الفاتورة"
                        className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                      />
                    </label>
                  )}

                {canManageCompany &&
                  renderSettingRow(
                    'رسوم التوصيل على الفاتورة (اختياري)',
                    'تفعيل إظهار حقل يدوي لإضافة رسوم التوصيل في ملخص فاتورة نقطة البيع دون التأثير على عمولة المنصة أو الضريبة.',
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold ${
                          companySettings.enableDeliveryFee
                            ? 'ui-money-purchase'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {companySettings.enableDeliveryFee ? 'مفعّل' : 'مغلق'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCompanySettings({
                            ...companySettings,
                            enableDeliveryFee: !companySettings.enableDeliveryFee
                          })
                        }
                        role="switch"
                        aria-checked={Boolean(companySettings.enableDeliveryFee)}
                        aria-label="رسوم التوصيل على الفاتورة (اختياري)"
                        className="min-h-[44px] inline-flex items-center px-1 cursor-pointer"
                      >
                        <span
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                            companySettings.enableDeliveryFee ? 'bg-cyan-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              companySettings.enableDeliveryFee ? 'translate-x-0' : '-translate-x-5'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3b) صفحة: شاشة الزوار */}
      {activeTab === 'visitor' && canManageVisitorDisplay && (
        <div data-testid="settings-visitor-page" className="space-y-6">
          {/* قسم صور العرض (حفظ فوري) */}
          <div className="space-y-4">
            <SectionHeading
              title="صور العرض"
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                    {visitorSlides.length} / {MAX_VISITOR_SLIDES}
                  </span>

                  <label
                    className={`min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#1668B2] hover:bg-[#125491] text-white font-bold text-xs transition ${
                      isUploadingVisitorSlides || visitorSlides.length >= MAX_VISITOR_SLIDES
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                  >
                    {isUploadingVisitorSlides ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>إضافة صور</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      disabled={isUploadingVisitorSlides || visitorSlides.length >= MAX_VISITOR_SLIDES}
                      onChange={handleAddVisitorSlidesFiles}
                      data-testid="visitor-add-slides-input"
                      className="hidden"
                    />
                  </label>

                  <a
                    href="/visitor"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="visitor-open-screen-btn"
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح الشاشة</span>
                  </a>
                </div>
              }
            />

            {visitorSlidesProgress && (
              <div
                role="status"
                data-testid="visitor-slides-progress"
                className="text-xs font-bold ui-link flex items-center gap-2 py-1"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{visitorSlidesProgress}</span>
              </div>
            )}

            {visitorSlidesError && (
              <div
                role="alert"
                data-testid="visitor-slides-error"
                className="text-xs font-bold ui-stock-out flex items-center gap-2 py-1"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{visitorSlidesError}</span>
              </div>
            )}

            {visitorSlides.length === 0 ? (
              <div
                data-testid="visitor-slides-empty"
                className="py-6 border-b border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-center gap-2"
              >
                <ImageIcon className="w-4 h-4 shrink-0" />
                <span>لا توجد صور عرض مضافة بعد — اضغط «إضافة صور» لرفع حتى 20 صورة.</span>
              </div>
            ) : (
              <div data-testid="visitor-slides-list" className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                {visitorSlides.map((slide, idx) => (
                  <div
                    key={slide.id}
                    data-testid={`visitor-slide-row-${idx}`}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        data-testid={`visitor-slide-num-${idx}`}
                        className="w-7 text-center font-mono text-xs font-extrabold text-[var(--text-secondary)] shrink-0"
                      >
                        {idx + 1}
                      </span>
                      <img
                        src={slide.url || slide.imageUrl || ''}
                        alt={`صورة عرض ${idx + 1}`}
                        className="w-20 h-12 object-contain rounded border border-[var(--border-color)] bg-white shrink-0"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0 || isReorderingVisitorSlides}
                        onClick={() => void handleMoveVisitorSlide(idx, 'up')}
                        data-testid={`visitor-slide-up-${idx}`}
                        className="min-h-[44px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition cursor-pointer disabled:opacity-40"
                        title="تحريك لأعلى"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span>لأعلى</span>
                      </button>

                      <button
                        type="button"
                        disabled={idx === visitorSlides.length - 1 || isReorderingVisitorSlides}
                        onClick={() => void handleMoveVisitorSlide(idx, 'down')}
                        data-testid={`visitor-slide-down-${idx}`}
                        className="min-h-[44px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition cursor-pointer disabled:opacity-40"
                        title="تحريك لأسفل"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                        <span>لأسفل</span>
                      </button>

                      <button
                        type="button"
                        disabled={isDeletingVisitorSlide}
                        onClick={() => setVisitorSlideToDelete(slide)}
                        data-testid={`visitor-slide-delete-${idx}`}
                        className="min-h-[44px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] ui-stock-out font-bold text-xs transition cursor-pointer disabled:opacity-40"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* إعدادات العرض والترحيب (تُحفظ بشريط الحفظ الموحد) */}
          <div className="space-y-4">
            <SectionHeading title="إعدادات العرض والترحيب" withTopDivider />

            <div>
              {renderSettingRow(
                'مدة كل صورة (بالثواني)',
                'المدة الزمنية لعرض كل صورة قبل الانتقال للصورة التالية (من 3 إلى 60 ثانية).',
                <div className="flex items-center gap-2">
                  <input
                    id="visitor-slide-seconds"
                    type="number"
                    min={3}
                    max={60}
                    value={visitorSettings.slideSeconds}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setVisitorSettings((prev) => ({
                        ...prev,
                        slideSeconds: Number.isFinite(val) ? Math.max(3, Math.min(60, val)) : 8
                      }));
                    }}
                    data-testid="visitor-slide-seconds-input"
                    className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono font-bold text-xs`}
                  />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">ثانية</span>
                </div>,
                'visitor-slide-seconds'
              )}

              {renderSettingRow(
                'مدة ظهور المنتج (بالثواني)',
                'المدة الزمنية لعرض اسم وسعر المنتج بعد مسح الباركود قبل الرجوع لصور العرض (من 3 إلى 60 ثانية).',
                <div className="flex items-center gap-2">
                  <input
                    id="visitor-result-seconds"
                    type="number"
                    min={3}
                    max={60}
                    value={visitorSettings.resultSeconds}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setVisitorSettings((prev) => ({
                        ...prev,
                        resultSeconds: Number.isFinite(val) ? Math.max(3, Math.min(60, val)) : 6
                      }));
                    }}
                    data-testid="visitor-result-seconds-input"
                    className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono font-bold text-xs`}
                  />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">ثانية</span>
                </div>,
                'visitor-result-seconds'
              )}

              {renderSettingRow(
                'إظهار نص الترحيب',
                'عرض جملة ترحيبية أعلى شاشة الزوار فوق صور العرض (حتى 120 حرفًا).',
                <div className="flex flex-wrap items-center gap-3">
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(visitorSettings.showWelcome)}
                      onChange={(e) =>
                        setVisitorSettings((prev) => ({
                          ...prev,
                          showWelcome: e.target.checked
                        }))
                      }
                      aria-label="إظهار نص الترحيب"
                      data-testid="visitor-show-welcome-checkbox"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={visitorSettings.welcomeText || ''}
                    onChange={(e) =>
                      setVisitorSettings((prev) => ({
                        ...prev,
                        welcomeText: e.target.value.slice(0, 120)
                      }))
                    }
                    placeholder="أهلاً بكم — امسح باركود المنتج لمعرفة السعر"
                    aria-label="نص الترحيب"
                    data-testid="visitor-welcome-text-input"
                    className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs`}
                  />
                </div>
              )}

              {renderSettingRow(
                'إظهار شعار الشركة',
                !companySettings.logoUrl?.trim() ? (
                  <span className="ui-stock-low font-bold">
                    أضف رابط الشعار من صفحة بيانات المنشأة
                  </span>
                ) : (
                  'عرض شعار الشركة المسجل في بيانات المنشأة أعلى شاشة الزوار.'
                ),
                <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(visitorSettings.showLogo)}
                    onChange={(e) =>
                      setVisitorSettings((prev) => ({
                        ...prev,
                        showLogo: e.target.checked
                      }))
                    }
                    aria-label="إظهار شعار الشركة"
                    data-testid="visitor-show-logo-checkbox"
                    className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                  />
                </label>
              )}
            </div>

            <p
              data-testid="visitor-device-setup-guide"
              className="text-xs text-[var(--text-secondary)] leading-relaxed pt-2"
            >
              لتشغيل الشاشة على جهاز: أنشئ مستخدمًا من صفحة المستخدمين وأعطه صلاحية «شاشة الزوار» فقط، وادخل به على الجهاز
            </p>
          </div>
        </div>
      )}

      {/* 4) صفحة: الأصناف والمخزون */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          {canManageNegativeStock && (
            <div className="space-y-4">
              <SectionHeading title="سياسة المخزون" />
              <div>
                {renderSettingRow(
                  'السماح بالبيع بالسالب',
                  'السماح بإتمام عمليات البيع وتجاوز رصيد المخزون المتاح حتى لو نزل الرصيد إلى ما دون الصفر.',
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold ${
                        stockSettings.allowNegativeStockSale ? 'ui-stock-low' : 'ui-money-purchase'
                      }`}
                    >
                      {stockSettings.allowNegativeStockSale
                        ? 'مفعّل (يُسمح بالبيع دون رصيد)'
                        : 'معطّل (منع البيع عند نفاد الرصيد)'}
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleNegativeStockClick}
                      role="switch"
                      aria-checked={stockSettings.allowNegativeStockSale}
                      aria-label="السماح بالبيع بالسالب"
                      className="min-h-[44px] inline-flex items-center px-1 cursor-pointer"
                    >
                      <span
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          stockSettings.allowNegativeStockSale ? 'bg-amber-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            stockSettings.allowNegativeStockSale ? 'translate-x-0' : '-translate-x-5'
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                )}

                {renderSettingRow(
                  'السماح بالتحويل بالسالب',
                  'إعداد مستقل عن البيع بالسالب: يسمح بتنفيذ أوامر الصرف والتحويل بين المخازن حتى لو تجاوزت الكمية المنقولة الرصيد المتاح في المخزن المحوِّل.',
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold ${
                        stockSettings.allowNegativeWarehouseTransfer
                          ? 'ui-stock-low'
                          : 'ui-money-purchase'
                      }`}
                    >
                      {stockSettings.allowNegativeWarehouseTransfer
                        ? 'مفعّل (يُسمح بالتحويل دون رصيد)'
                        : 'معطّل (منع التحويل عند عدم كفاية الرصيد)'}
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleNegativeTransferClick}
                      role="switch"
                      aria-checked={Boolean(stockSettings.allowNegativeWarehouseTransfer)}
                      aria-label="السماح بالتحويل بالسالب"
                      className="min-h-[44px] inline-flex items-center px-1 cursor-pointer"
                    >
                      <span
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          stockSettings.allowNegativeWarehouseTransfer ? 'bg-amber-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            stockSettings.allowNegativeWarehouseTransfer ? 'translate-x-0' : '-translate-x-5'
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {canManageDisplay && (
            <div className="space-y-4">
              <SectionHeading
                title="عرض الأصناف وجدول المخزون"
                withTopDivider={canManageNegativeStock}
              />
              <div>
                {renderSettingRow(
                  'إظهار رصيد المخزون الحالي',
                  'رؤية الكمية المتبقية مباشرة على بطاقة الصنف.',
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={displaySettings.showStockQuantity}
                      onChange={(e) =>
                        setDisplaySettings({ ...displaySettings, showStockQuantity: e.target.checked })
                      }
                      aria-label="إظهار رصيد المخزون الحالي"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                )}

                {renderSettingRow(
                  'إظهار شارة حالة المخزن (متوفر/منخفض)',
                  'تمييز الأصناف التي قاربت على النفاد بلون تحذيري.',
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={displaySettings.showStockStatusBadge}
                      onChange={(e) =>
                        setDisplaySettings({
                          ...displaySettings,
                          showStockStatusBadge: e.target.checked
                        })
                      }
                      aria-label="إظهار شارة حالة المخزن"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                )}

                {renderSettingRow(
                  'التعديل المباشر من جدول الأصناف',
                  'تشغيل أو إيقاف التعديل المباشر لاسم الصنف، الوصف، الأسعار، الباركود، التصنيف، والوحدة داخل جدول الأصناف لمن يملك الصلاحية.',
                  <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(displaySettings.enableInlineEdit)}
                      onChange={(e) =>
                        setDisplaySettings({ ...displaySettings, enableInlineEdit: e.target.checked })
                      }
                      aria-label="التعديل المباشر من جدول الأصناف"
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                    />
                  </label>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5) صفحة: الفواتير والطباعة */}
      {activeTab === 'print' && (canManagePrint || canManageInvoiceNumbering) && (
        <div className="space-y-8">
          {canManagePrint && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* عمود الخيارات */}
              <div className="lg:col-span-7 space-y-6">
                <SectionHeading title="مقاس الورق والمعاينة" />
            <div>
              {renderSettingRow(
                'مقاس ورق الإيصال',
                'اختر مقاس الطابعة الحرارية أو الورق الكامل.',
                <div className="flex flex-wrap items-center gap-2">
                  {(['58mm', '80mm', 'a4'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        const autoWidth = size === '58mm' ? 48 : size === '80mm' ? 72 : 190;
                        setInvoiceSettings({
                          ...invoiceSettings,
                          paperSize: size,
                          printableWidthMm: autoWidth
                        });
                      }}
                      className={`min-h-[44px] px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                        invoiceSettings.paperSize === size
                          ? 'bg-[#1668B2] text-white'
                          : 'border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      {size === '58mm'
                        ? '58 مم (طابعة صغيرة)'
                        : size === '80mm'
                        ? '80 مم (طابعة فواتير)'
                        : 'A4 (ورق كامل)'}
                    </button>
                  ))}
                </div>
              )}

              {invoiceSettings.paperSize !== 'a4' &&
                renderSettingRow(
                  'عرض منطقة الطباعة الفعلية (مم)',
                  'الافتراضي 72 مم لورق 80 مم و48 مم لورق 58 مم لتفادي قص هوامش الطابعات المختلفة.',
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={40}
                      max={80}
                      step={1}
                      value={
                        invoiceSettings.printableWidthMm ??
                        (invoiceSettings.paperSize === '58mm' ? 48 : 72)
                      }
                      onChange={(e) =>
                        setInvoiceSettings({
                          ...invoiceSettings,
                          printableWidthMm: Number(e.target.value)
                        })
                      }
                      className="w-36 accent-cyan-700 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={40}
                      max={80}
                      value={
                        invoiceSettings.printableWidthMm ??
                        (invoiceSettings.paperSize === '58mm' ? 48 : 72)
                      }
                      onChange={(e) =>
                        setInvoiceSettings({
                          ...invoiceSettings,
                          printableWidthMm: Math.min(80, Math.max(40, Number(e.target.value)))
                        })
                      }
                      className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono font-bold text-xs`}
                    />
                  </div>
                )}

              {renderSettingRow(
                'إظهار نافذة معاينة الإيصال قبل الطباعة',
                'معطل افتراضياً للطباعة المباشرة فور إنهاء الفاتورة لسرعة عمل الكاشير.',
                <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(invoiceSettings.showReceiptPreview)}
                    onChange={(e) =>
                      setInvoiceSettings({ ...invoiceSettings, showReceiptPreview: e.target.checked })
                    }
                    aria-label="إظهار نافذة معاينة الإيصال قبل الطباعة"
                    className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                  />
                </label>
              )}
            </div>

            <SectionHeading title="1. الهيدر والترويسة" withTopDivider />
            <div>
              {renderSettingRow(
                'صورة الهيدر المخصصة',
                'تظهر في أعلى الإيصال بعرض كامل (أقصى ارتفاع 30 مم، تُضغط لأقل من 300 ك.ب).',
                <div className="flex flex-wrap items-center gap-3">
                  <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(invoiceSettings.showHeaderImage)}
                      onChange={(e) =>
                        setInvoiceSettings({ ...invoiceSettings, showHeaderImage: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#1668B2]"
                    />
                    <span>إظهار صورة الهيدر</span>
                  </label>

                  {invoiceSettings.headerImageUrl && (
                    <img
                      src={invoiceSettings.headerImageUrl}
                      alt="Header"
                      className="h-10 max-w-[120px] object-contain border border-[var(--border-color)] rounded p-0.5 bg-white"
                    />
                  )}

                  <label className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-xs font-bold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {isUploadingHeaderImage
                        ? 'جاري الرفع...'
                        : invoiceSettings.headerImageUrl
                        ? 'تغيير الصورة'
                        : 'اختيار صورة (PNG / JPEG)'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleHeaderImageFileChange}
                      disabled={isUploadingHeaderImage}
                      className="hidden"
                    />
                  </label>

                  {invoiceSettings.headerImageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveHeaderImage}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[var(--border-color)] ui-stock-out hover:bg-[var(--surface-subtle)] cursor-pointer"
                      title="حذف صورة الهيدر"
                      aria-label="حذف صورة الهيدر"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {headerImageStatus && (
                <p className="text-[11px] ui-link font-bold py-1.5 border-b border-[var(--border-subtle)]">
                  {headerImageStatus}
                </p>
              )}

              {[
                { key: 'showInvoiceNumber', label: 'إظهار رقم الفاتورة' },
                { key: 'showDateTime', label: 'إظهار تاريخ ووقت الفاتورة' },
                { key: 'showInvoiceStatus', label: 'إظهار حالة الفاتورة' },
                { key: 'showLogo', label: 'إظهار شعار الشركة' },
                { key: 'showCompanyName', label: 'إظهار اسم الشركة' },
                { key: 'showTagline', label: 'إظهار الشعار النصي' },
                { key: 'showTaxNumber', label: 'إظهار الرقم الضريبي' },
                { key: 'showCommercialRecord', label: 'إظهار السجل التجاري' },
                { key: 'showAddress', label: 'إظهار عنوان المقر' },
                { key: 'showPhone', label: 'إظهار رقم هاتف المتجر' },
                { key: 'showPlatform', label: 'إظهار منصة البيع' },
                { key: 'showCashier', label: 'إظهار اسم الكاشير' }
              ].map((field) =>
                React.cloneElement(
                  renderSettingRow(
                    field.label,
                    null,
                    <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean((invoiceSettings as any)[field.key])}
                        onChange={(e) =>
                          setInvoiceSettings({ ...invoiceSettings, [field.key]: e.target.checked })
                        }
                        aria-label={field.label}
                        className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                      />
                    </label>
                  ),
                  { key: field.key }
                )
              )}

              {renderSettingRow(
                'نص إضافي أسفل الفاتورة (اختياري)',
                'اتركها فارغة لإخفائها.',
                <input
                  id="print-header-text"
                  type="text"
                  value={invoiceSettings.headerText ?? ''}
                  onChange={(e) => setInvoiceSettings({ ...invoiceSettings, headerText: e.target.value })}
                  placeholder="اتركها فارغة لإخفائها"
                  className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs`}
                />,
                'print-header-text'
              )}
            </div>

            <SectionHeading
              title="2. بيانات العميل"
              withTopDivider
              actions={
                <span className="text-[11px] text-[var(--text-secondary)]">
                  تظهر فقط إذا كانت الفاتورة لعميل محدد وليست للجمهور
                </span>
              }
            />
            <div>
              {[
                { key: 'showCustomerName', label: 'إظهار اسم العميل' },
                { key: 'showCustomerPhone', label: 'إظهار رقم هاتف العميل' },
                { key: 'showCustomerAddress', label: 'إظهار عنوان العميل' },
                { key: 'showCustomerBalance', label: 'إظهار رصيد العميل بعد الفاتورة (أول طباعة فقط)' }
              ].map((field) =>
                React.cloneElement(
                  renderSettingRow(
                    field.label,
                    null,
                    <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean((invoiceSettings as any)[field.key])}
                        onChange={(e) =>
                          setInvoiceSettings({ ...invoiceSettings, [field.key]: e.target.checked })
                        }
                        aria-label={field.label}
                        className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                      />
                    </label>
                  ),
                  { key: field.key }
                )
              )}
            </div>

            <SectionHeading title="3. الأصناف في الفاتورة المطبوعة" withTopDivider />
            <div>
              {renderSettingRow(
                'الاسم المطبوع للعميل',
                'اختر ما يُطبع للعميل في عمود الصنف بالإيصال والفاتورة المطبوعة (في حال اختيار «اسم الطباعة» وكان فارغاً للصنف سيُطبع اسم الصنف تلقائياً).',
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { value: 'name', label: 'اسم الصنف' },
                      { value: 'printName', label: 'اسم الطباعة' }
                    ] as const
                  ).map((opt) => {
                    const currentSelection =
                      invoiceSettings.printedItemLabel === 'printName' ? 'printName' : 'name';
                    const isSelected = currentSelection === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setInvoiceSettings({
                            ...invoiceSettings,
                            printedItemLabel: opt.value
                          })
                        }
                        className={`min-h-[44px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1668B2] border-[#1668B2] text-white'
                            : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {renderSettingRow(
                'إظهار إجمالي عدد الأصناف والقطع',
                null,
                <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(invoiceSettings.showItemsCount)}
                    onChange={(e) =>
                      setInvoiceSettings({ ...invoiceSettings, showItemsCount: e.target.checked })
                    }
                    aria-label="إظهار إجمالي عدد الأصناف والقطع"
                    className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                  />
                </label>
              )}
            </div>

            <SectionHeading title="4. الدفع والتحصيل" withTopDivider />
            <div>
              {[
                { key: 'showPaymentDetails', label: 'إظهار تفاصيل الدفع (المطلوب والمدفوع والباقي)' },
                { key: 'showDiscounts', label: 'إظهار استقطاع عمولة / خصم المنصة' }
              ].map((field) =>
                React.cloneElement(
                  renderSettingRow(
                    field.label,
                    null,
                    <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean((invoiceSettings as any)[field.key])}
                        onChange={(e) =>
                          setInvoiceSettings({ ...invoiceSettings, [field.key]: e.target.checked })
                        }
                        aria-label={field.label}
                        className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                      />
                    </label>
                  ),
                  { key: field.key }
                )
              )}
            </div>

            <SectionHeading title="5. الفوتر والـ QR" withTopDivider />
            <div>
              {[
                { key: 'showBarcode', label: 'إظهار QR رقم الفاتورة' },
                { key: 'showNotes', label: 'إظهار ملاحظات الفاتورة' }
              ].map((field) =>
                React.cloneElement(
                  renderSettingRow(
                    field.label,
                    null,
                    <label className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean((invoiceSettings as any)[field.key])}
                        onChange={(e) =>
                          setInvoiceSettings({ ...invoiceSettings, [field.key]: e.target.checked })
                        }
                        aria-label={field.label}
                        className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                      />
                    </label>
                  ),
                  { key: field.key }
                )
              )}

              {renderSettingRow(
                'نص التذييل والترحيب (Footer)',
                null,
                <input
                  id="print-footer-text"
                  type="text"
                  value={invoiceSettings.footerText ?? ''}
                  onChange={(e) => setInvoiceSettings({ ...invoiceSettings, footerText: e.target.value })}
                  placeholder="شكراً لتعاملكم معنا"
                  className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs`}
                />,
                'print-footer-text'
              )}

              {renderSettingRow(
                'شروط البيع والاسترجاع',
                null,
                <textarea
                  id="print-terms"
                  rows={2}
                  value={invoiceSettings.termsAndConditions ?? ''}
                  onChange={(e) =>
                    setInvoiceSettings({ ...invoiceSettings, termsAndConditions: e.target.value })
                  }
                  className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs`}
                />,
                'print-terms'
              )}

              {renderSettingRow(
                'سياسة الاسترجاع والشحن',
                null,
                <textarea
                  id="print-return-policy"
                  rows={2}
                  value={invoiceSettings.returnPolicyText ?? ''}
                  onChange={(e) =>
                    setInvoiceSettings({ ...invoiceSettings, returnPolicyText: e.target.value })
                  }
                  className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.notes} text-xs`}
                />,
                'print-return-policy'
              )}
            </div>
          </div>

          {/* عمود المعاينة الحية بدون صندوق خلفي ملوّن */}
          <div className="lg:col-span-5 space-y-3">
            <SectionHeading
              title={`معاينة حية ومطابقة للطباعة (${invoiceSettings.paperSize})`}
              actions={<span className="text-[11px] text-[var(--text-secondary)]">محدثة فورياً</span>}
            />
            <div className="flex justify-center items-start overflow-x-auto pt-2">
              <div
                className="bg-white text-black p-3 border border-[var(--border-color)]"
                style={{
                  width:
                    invoiceSettings.paperSize === 'a4'
                      ? '100%'
                      : `${
                          invoiceSettings.printableWidthMm ??
                          (invoiceSettings.paperSize === '58mm' ? 48 : 72)
                        }mm`,
                  maxWidth: invoiceSettings.paperSize === 'a4' ? '500px' : undefined
                }}
              >
                <ReceiptPrintArea
                  invoice={DEMO_INVOICE}
                  companySettings={companySettings}
                  invoicePrintSettings={invoiceSettings}
                  storeName={companySettings.storeName}
                  isReprint={false}
                  customers={[DEMO_CUSTOMER]}
                  changeGiven={45.0}
                  customerBalanceAfter={1250.0}
                />
              </div>
            </div>
          </div>
            </div>
          )}

          {canManageInvoiceNumbering && (() => {
            const liveExample = formatLiveInvoiceNumberExample(invoiceNumbering);
            const liveMayRepeat =
              INVOICE_DATE_RANK[invoiceNumbering.datePart] <
              INVOICE_RESET_NEEDS[invoiceNumbering.resetPeriod];
            const effectiveMayRepeat = liveMayRepeat || mayRepeat;
            const effectiveMayRepeatNote =
              mayRepeatNote ||
              'الرقم مفيهوش تاريخ يكفي فترة التصفير: بعد التصفير الأرقام اللي اتستخدمت قبل كده هتتعدّى تلقائيًا (البرنامج ما بيكررش رقم فاتورة). لو عايز العد يرجع فعلًا من الأول، حط التاريخ في الرقم.';

            return (
              <div id="settings-invoice-numbering-section" className="space-y-4">
                <SectionHeading title="ترقيم الفواتير" withTopDivider={canManagePrint} />

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5 border-b border-[var(--border-subtle)] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-secondary)]">مثال:</span>
                    <span
                      data-testid="invoice-numbering-live-example"
                      className="font-mono font-extrabold text-sm text-[var(--text-primary)] tabular-nums"
                      dir="ltr"
                    >
                      {liveExample}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-secondary)]">الفاتورة الجاية:</span>
                    <span
                      data-testid="invoice-numbering-next-number"
                      className="font-mono font-extrabold text-sm ui-link tabular-nums"
                      dir="ltr"
                    >
                      {nextNumber || liveExample}
                    </span>
                  </div>
                </div>

                {effectiveMayRepeat && (
                  <div
                    role="alert"
                    data-testid="invoice-numbering-may-repeat-note"
                    className="flex items-start gap-2 py-1.5 text-xs font-bold ui-stock-low"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{effectiveMayRepeatNote}</span>
                  </div>
                )}

                <div>
                  {renderSettingRow(
                    'النص قبل الرقم',
                    'حتى 12 حرفًا (مثال INV-). حروف وأرقام والرموز - _ / . # فقط بدون مسافات.',
                    <input
                      id="invoice-numbering-prefix"
                      type="text"
                      maxLength={12}
                      value={invoiceNumbering.prefix}
                      onChange={(e) => {
                        setNumberingFeedback(null);
                        setInvoiceNumbering((prev) => ({ ...prev, prefix: e.target.value }));
                      }}
                      placeholder="INV-"
                      dir="ltr"
                      className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} font-mono text-xs`}
                    />,
                    'invoice-numbering-prefix'
                  )}

                  {renderSettingRow(
                    'التاريخ في الرقم',
                    'إدراج التاريخ في رقم الفاتورة.',
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'none', label: 'بدون تاريخ' },
                          { id: 'year', label: 'السنة' },
                          { id: 'month', label: 'السنة والشهر' },
                          { id: 'day', label: 'اليوم كامل' }
                        ] as { id: InvoiceNumberingSettings['datePart']; label: string }[]
                      ).map((opt) => {
                        const active = invoiceNumbering.datePart === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setNumberingFeedback(null);
                              setInvoiceNumbering((prev) => ({ ...prev, datePart: opt.id }));
                            }}
                            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {invoiceNumbering.datePart !== 'none' &&
                    renderSettingRow(
                      'الفاصل',
                      'الفاصل بين التاريخ والعدد.',
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: '-', label: '-' },
                            { id: '/', label: '/' },
                            { id: '', label: 'بدون' }
                          ] as { id: InvoiceNumberingSettings['separator']; label: string }[]
                        ).map((opt) => {
                          const active = invoiceNumbering.separator === opt.id;
                          return (
                            <button
                              key={opt.id || 'none'}
                              type="button"
                              onClick={() => {
                                setNumberingFeedback(null);
                                setInvoiceNumbering((prev) => ({ ...prev, separator: opt.id }));
                              }}
                              className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                active
                                  ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                  : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                  {renderSettingRow(
                    'عدد خانات العدد',
                    'من 1 إلى 8 خانات (تُستكمل بأصفار على اليسار).',
                    <input
                      id="invoice-numbering-digits"
                      type="number"
                      min={1}
                      max={8}
                      value={invoiceNumbering.digits}
                      onChange={(e) => {
                        setNumberingFeedback(null);
                        const num = Math.min(8, Math.max(1, Math.round(Number(e.target.value) || 1)));
                        setInvoiceNumbering((prev) => ({ ...prev, digits: num }));
                      }}
                      className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono font-bold text-xs`}
                    />,
                    'invoice-numbering-digits'
                  )}

                  {renderSettingRow(
                    'النص بعد الرقم',
                    'اختياري (حتى 12 حرفًا).',
                    <input
                      id="invoice-numbering-suffix"
                      type="text"
                      maxLength={12}
                      value={invoiceNumbering.suffix}
                      onChange={(e) => {
                        setNumberingFeedback(null);
                        setInvoiceNumbering((prev) => ({ ...prev, suffix: e.target.value }));
                      }}
                      placeholder=""
                      dir="ltr"
                      className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} font-mono text-xs`}
                    />,
                    'invoice-numbering-suffix'
                  )}

                  {renderSettingRow(
                    'بداية العد من جديد',
                    'متى يبدأ العد من رقم البداية تلقائيًا.',
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'daily', label: 'كل يوم' },
                          { id: 'weekly', label: 'كل أسبوع (يبدأ السبت)' },
                          { id: 'monthly', label: 'كل شهر' },
                          { id: 'yearly', label: 'كل سنة' },
                          { id: 'never', label: 'أبدًا' }
                        ] as { id: InvoiceNumberingSettings['resetPeriod']; label: string }[]
                      ).map((opt) => {
                        const active = invoiceNumbering.resetPeriod === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setNumberingFeedback(null);
                              setInvoiceNumbering((prev) => ({ ...prev, resetPeriod: opt.id }));
                            }}
                            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {renderSettingRow(
                    'رقم البداية',
                    'يبدأ منه العد بعد كل تصفير (الافتراضي 1).',
                    <input
                      id="invoice-numbering-start-at"
                      type="number"
                      min={1}
                      max={99999999}
                      value={invoiceNumbering.startAt}
                      onChange={(e) => {
                        setNumberingFeedback(null);
                        const num = Math.max(1, Math.round(Number(e.target.value) || 1));
                        setInvoiceNumbering((prev) => ({ ...prev, startAt: num }));
                      }}
                      className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-center font-mono font-bold text-xs`}
                    />,
                    'invoice-numbering-start-at'
                  )}

                  {renderSettingRow(
                    'رقم طلب المنصة',
                    'التعامل مع تكرار رقم طلب المنصة على نفس المنصة في الفواتير السارية.',
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'block', label: 'ممنوع يتكرر على نفس المنصة' },
                          { id: 'allow', label: 'مسموح يتكرر' }
                        ] as {
                          id: InvoiceNumberingSettings['platformOrderDuplicates'];
                          label: string;
                        }[]
                      ).map((opt) => {
                        const active = invoiceNumbering.platformOrderDuplicates === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setNumberingFeedback(null);
                              setInvoiceNumbering((prev) => ({
                                ...prev,
                                platformOrderDuplicates: opt.id
                              }));
                            }}
                            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              active
                                ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {numberingFeedback && (
                  <div
                    role={numberingFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`flex items-center gap-2 text-xs font-bold ${
                      numberingFeedback.type === 'error' ? 'ui-stock-out' : 'ui-stock-in'
                    }`}
                  >
                    {numberingFeedback.type === 'error' ? (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{numberingFeedback.message}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveInvoiceNumberingSection}
                      disabled={isSavingNumbering}
                      data-testid="save-invoice-numbering-btn"
                      className="min-h-[44px] px-5 rounded-lg bg-[#1668B2] hover:bg-[#125491] disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                    >
                      {isSavingNumbering ? 'جاري الحفظ...' : 'حفظ'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setResetCounterStartInput('');
                        setResetCounterError(null);
                        setIsResetCounterModalOpen(true);
                      }}
                      data-testid="reset-invoice-counter-btn"
                      className="min-h-[44px] px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] text-xs font-bold transition cursor-pointer"
                    >
                      تصفير العدد الآن
                    </button>
                  </div>

                  {(committedInvoiceNumbering.updatedBy || committedInvoiceNumbering.updatedAt) && (
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      آخر تعديل: {committedInvoiceNumbering.updatedBy || '—'} —{' '}
                      {committedInvoiceNumbering.updatedAt
                        ? new Date(committedInvoiceNumbering.updatedAt).toLocaleString('ar-EG')
                        : '—'}
                    </div>
                  )}
                </div>

                {isResetCounterModalOpen && (
                  <ModalShell
                    title="تصفير عد الفواتير الآن"
                    onClose={() => !isResettingCounter && setIsResetCounterModalOpen(false)}
                    closeDisabled={isResettingCounter}
                    footer={
                      <>
                        <button
                          type="button"
                          onClick={() => setIsResetCounterModalOpen(false)}
                          disabled={isResettingCounter}
                          className="min-h-[44px] px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-xs font-bold text-[var(--text-primary)] cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmResetInvoiceCounter}
                          disabled={isResettingCounter}
                          data-testid="confirm-reset-invoice-counter-btn"
                          className="min-h-[44px] px-5 rounded-lg bg-[#1668B2] hover:bg-[#125491] disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                        >
                          {isResettingCounter ? 'جاري التصفير...' : 'تأكيد التصفير'}
                        </button>
                      </>
                    }
                  >
                    <p className="text-xs font-bold text-[var(--text-primary)] leading-relaxed">
                      الفاتورة الجاية هتبدأ من رقم البداية. الأرقام اللي اتستخدمت قبل كده ما بتتكررش.
                    </p>

                    {resetCounterError && (
                      <div role="alert" className="flex items-center gap-2 text-xs font-bold ui-stock-out">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{resetCounterError}</span>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="reset-counter-custom-start"
                        className="block text-xs font-bold text-[var(--text-primary)] mb-1"
                      >
                        رقم بداية مختلف (اختياري)
                      </label>
                      <input
                        id="reset-counter-custom-start"
                        type="number"
                        min={1}
                        max={99999999}
                        value={resetCounterStartInput}
                        onChange={(e) => setResetCounterStartInput(e.target.value)}
                        placeholder={`الافتراضي: ${invoiceNumbering.startAt}`}
                        className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} font-mono text-xs`}
                      />
                    </div>
                  </ModalShell>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 5-ب) صفحة: طابعة الباركود */}
      {activeTab === 'labels' && canManageLabelPrint && (() => {
        const sampleItemFromList = items.find(
          (it) => itemBarcodeList(it as unknown as LabelItem).length > 0
        );
        const sampleLabelItem: LabelItem = sampleItemFromList
          ? (sampleItemFromList as unknown as LabelItem)
          : {
              id: 'sample-label-item',
              name: 'شاحن أنكر 65W سريع ثلاثي المنافذ',
              printName: 'شاحن أنكر 65W سريع',
              notes: 'شاحن أصلي بضمان سنتين',
              barcode: '6221234567896',
              salePrice: 850,
              taxRate: 14,
              unit: 'قطعة',
              status: 'active'
            };
        const sampleBarcode = defaultBarcodeFor(sampleLabelItem) || '6221234567896';
        const sampleCount = labelSettings.paper === 'roll' ? Math.max(1, labelSettings.columns) : 1;
        const sampleLine: LabelLine = {
          itemId: sampleLabelItem.id,
          barcode: sampleBarcode,
          count: sampleCount,
          expiry: '2026-12-31',
          unregisteredBarcode: false
        };
        const sampleContext = {
          items: [sampleLabelItem],
          companyName: companySettings.storeName || config.storeName || 'اسم المنشأة',
          logoUrl: companySettings.logoUrl || '',
          taxInclusive: taxSettings.taxInclusive ?? true
        };
        const liveSampleJob = buildLabelPrintHtml([sampleLine], labelSettings, sampleContext);
        const singleTestJob = buildLabelPrintHtml(
          [{ ...sampleLine, count: 1 }],
          labelSettings,
          sampleContext
        );

        const moveElement = (index: number, direction: -1 | 1) => {
          const target = index + direction;
          if (target < 0 || target >= labelSettings.elements.length) return;
          const nextElements = [...labelSettings.elements];
          const [moved] = nextElements.splice(index, 1);
          nextElements.splice(target, 0, moved);
          setLabelSettings({ ...labelSettings, elements: nextElements });
        };

        const updateElement = (key: LabelElementKey, patch: Partial<LabelElement>) => {
          setLabelSettings({
            ...labelSettings,
            elements: labelSettings.elements.map((el) =>
              el.key === key ? { ...el, ...patch } : el
            )
          });
        };

        const previewIframeWidthMm =
          labelSettings.paper === 'roll'
            ? labelSettings.pageMargin.left +
              labelSettings.pageMargin.right +
              labelSettings.columns * labelSettings.labelWidthMm +
              (labelSettings.columns - 1) * labelSettings.gapXMm +
              4
            : Math.min(210, labelSettings.labelWidthMm * Math.min(2, labelSettings.columns) + 20);
        const previewIframeHeightMm =
          labelSettings.paper === 'roll'
            ? labelSettings.pageMargin.top +
              labelSettings.pageMargin.bottom +
              labelSettings.labelHeightMm +
              4
            : labelSettings.labelHeightMm + 16;

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* عمود الإعدادات */}
            <div className="lg:col-span-7 space-y-6">
              {/* (أ) الورق والمقاسات والهوامش والدقة */}
              <SectionHeading title="الورق والمقاسات والهوامش" />
              <div>
                {renderSettingRow(
                  'نوع الورق',
                  'رول طابعة باركود حرارية (عمود واحد أو مقسوم لأكثر من تكت في الصف) أو ورقة A4 مقسومة.',
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { id: 'roll', label: 'رول (طابعة باركود)' },
                        { id: 'a4', label: 'A4 (ورقة مقسومة)' }
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`label-paper-${opt.id}`}
                        onClick={() =>
                          setLabelSettings({
                            ...labelSettings,
                            paper: opt.id,
                            columns:
                              opt.id === 'roll'
                                ? Math.min(4, Math.max(1, labelSettings.columns))
                                : Math.min(8, Math.max(1, labelSettings.columns === 1 ? 3 : labelSettings.columns))
                          })
                        }
                        className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          labelSettings.paper === opt.id
                            ? 'bg-[#1668B2] border-[#1668B2] text-white'
                            : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {renderSettingRow(
                  'مقاس التكت (العرض × الارتفاع بالمليمتر)',
                  'الافتراضي 40×25 مم، ويمكنك اختيار مقاس جاهز أو كتابة أي مقاس من 15×10 إلى 150×150 مم.',
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[var(--text-secondary)]">العرض:</span>
                        <input
                          type="number"
                          min={15}
                          max={150}
                          value={labelSettings.labelWidthMm}
                          aria-label="عرض التكت بالمليمتر"
                          data-testid="label-width-input"
                          onChange={(e) => {
                            const w = Number(e.target.value);
                            setLabelSettings({
                              ...labelSettings,
                              labelWidthMm: w,
                              barcodeWidthMm:
                                w >= 10 && labelSettings.barcodeWidthMm > w
                                  ? Math.max(10, w - 2)
                                  : labelSettings.barcodeWidthMm
                            });
                          }}
                          className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                        />
                      </div>
                      <span className="text-xs font-bold">×</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[var(--text-secondary)]">الارتفاع:</span>
                        <input
                          type="number"
                          min={10}
                          max={150}
                          value={labelSettings.labelHeightMm}
                          aria-label="ارتفاع التكت بالمليمتر"
                          data-testid="label-height-input"
                          onChange={(e) => {
                            const h = Number(e.target.value);
                            setLabelSettings({
                              ...labelSettings,
                              labelHeightMm: h,
                              barcodeHeightMm:
                                h >= 3 && labelSettings.barcodeHeightMm > h
                                  ? Math.max(3, Math.floor(h * 0.45))
                                  : labelSettings.barcodeHeightMm
                            });
                          }}
                          className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                        />
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">مم</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {LABEL_SIZE_PRESETS.map((preset) => {
                        const isSelected =
                          labelSettings.labelWidthMm === preset.widthMm &&
                          labelSettings.labelHeightMm === preset.heightMm;
                        return (
                          <button
                            key={`${preset.widthMm}x${preset.heightMm}`}
                            type="button"
                            data-testid={`label-preset-${preset.widthMm}x${preset.heightMm}`}
                            onClick={() =>
                              setLabelSettings({
                                ...labelSettings,
                                labelWidthMm: preset.widthMm,
                                labelHeightMm: preset.heightMm,
                                barcodeWidthMm: Math.min(
                                  labelSettings.barcodeWidthMm,
                                  Math.max(10, preset.widthMm - 2)
                                ),
                                barcodeHeightMm: Math.min(
                                  labelSettings.barcodeHeightMm,
                                  preset.heightMm
                                )
                              })
                            }
                            className={`min-h-[34px] px-2.5 rounded-lg font-mono text-xs font-bold border transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            {preset.widthMm}×{preset.heightMm}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {labelSettings.paper === 'roll' ? (
                  <>
                    {renderSettingRow(
                      'عدد التكت في الصف (1–4)',
                      'اختر 1 للرول العادي، أو 2 فما فوق للورق المقسوم على أكثر من تكت في نفس الصف.',
                      <input
                        type="number"
                        min={1}
                        max={4}
                        value={labelSettings.columns}
                        aria-label="عدد التكت في الصف"
                        data-testid="label-roll-columns-input"
                        onChange={(e) =>
                          setLabelSettings({
                            ...labelSettings,
                            columns: Number(e.target.value)
                          })
                        }
                        className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                      />
                    )}

                    {renderSettingRow(
                      'المسافة بين التكت في الصف (مم)',
                      'المسافة الأفقية الفاصلة بين التكت وبعضه في الورق المقسوم.',
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        value={labelSettings.gapXMm}
                        aria-label="المسافة بين التكت"
                        data-testid="label-gap-x-input"
                        onChange={(e) =>
                          setLabelSettings({
                            ...labelSettings,
                            gapXMm: Number(e.target.value)
                          })
                        }
                        className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {renderSettingRow(
                      'عدد الأعمدة والصفوف في صفحة A4',
                      'عدد الأعمدة (1–8) وعدد الصفوف (1–30) في ورقة A4 الواحدة.',
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[var(--text-secondary)]">الأعمدة (1–8):</span>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={labelSettings.columns}
                            aria-label="عدد الأعمدة في A4"
                            data-testid="label-a4-columns-input"
                            onChange={(e) =>
                              setLabelSettings({
                                ...labelSettings,
                                columns: Number(e.target.value)
                              })
                            }
                            className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[var(--text-secondary)]">الصفوف (1–30):</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={labelSettings.rows}
                            aria-label="عدد الصفوف في A4"
                            data-testid="label-a4-rows-input"
                            onChange={(e) =>
                              setLabelSettings({
                                ...labelSettings,
                                rows: Number(e.target.value)
                              })
                            }
                            className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                          />
                        </div>
                      </div>
                    )}

                    {renderSettingRow(
                      'المسافة الأفقية والرأسية بين التكت (مم)',
                      'المسافات الفاصلة بين الملصقات داخل ورقة A4.',
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[var(--text-secondary)]">أفقية:</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.5}
                            value={labelSettings.gapXMm}
                            aria-label="المسافة الأفقية بين التكت"
                            data-testid="label-a4-gap-x-input"
                            onChange={(e) =>
                              setLabelSettings({
                                ...labelSettings,
                                gapXMm: Number(e.target.value)
                              })
                            }
                            className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[var(--text-secondary)]">رأسية:</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.5}
                            value={labelSettings.gapYMm}
                            aria-label="المسافة الرأسية بين التكت"
                            data-testid="label-a4-gap-y-input"
                            onChange={(e) =>
                              setLabelSettings({
                                ...labelSettings,
                                gapYMm: Number(e.target.value)
                              })
                            }
                            className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {renderSettingRow(
                  'هوامش التكت الداخلية (مم)',
                  'الهامش الداخلي لكل تكت من الجهات الأربع (فوق، تحت، يمين، شمال).',
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { key: 'top', label: 'فوق' },
                        { key: 'bottom', label: 'تحت' },
                        { key: 'right', label: 'يمين' },
                        { key: 'left', label: 'شمال' }
                      ] as const
                    ).map((side) => (
                      <div key={side.key} className="flex items-center gap-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">{side.label}:</span>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={labelSettings.labelMargin[side.key]}
                          aria-label={`هامش التكت ${side.label}`}
                          data-testid={`label-margin-${side.key}`}
                          onChange={(e) =>
                            setLabelSettings({
                              ...labelSettings,
                              labelMargin: {
                                ...labelSettings.labelMargin,
                                [side.key]: Number(e.target.value)
                              }
                            })
                          }
                          className={`${FORM_CONTROL_BASE_CLASS} w-16 text-center font-mono text-xs font-bold`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {renderSettingRow(
                  'هوامش الصفحة (مم)',
                  'هامش بداية ونهاية وجوانب الرول أو ورقة A4 (فوق، تحت، يمين، شمال).',
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { key: 'top', label: 'فوق' },
                        { key: 'bottom', label: 'تحت' },
                        { key: 'right', label: 'يمين' },
                        { key: 'left', label: 'شمال' }
                      ] as const
                    ).map((side) => (
                      <div key={side.key} className="flex items-center gap-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">{side.label}:</span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          step={0.5}
                          value={labelSettings.pageMargin[side.key]}
                          aria-label={`هامش الصفحة ${side.label}`}
                          data-testid={`page-margin-${side.key}`}
                          onChange={(e) =>
                            setLabelSettings({
                              ...labelSettings,
                              pageMargin: {
                                ...labelSettings.pageMargin,
                                [side.key]: Number(e.target.value)
                              }
                            })
                          }
                          className={`${FORM_CONTROL_BASE_CLASS} w-16 text-center font-mono text-xs font-bold`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {renderSettingRow(
                  'دقة الطابعة',
                  'يُضبط عرض خطوط الباركود على نقاط الطابعة الفعلية حتى تخرج الخطوط حادة وتُقرأ بسهولة.',
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { dpi: 203, label: '203 نقطة/بوصة (الأشهر)' },
                        { dpi: 300, label: '300 نقطة/بوصة' }
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.dpi}
                        type="button"
                        data-testid={`label-dpi-${opt.dpi}`}
                        onClick={() => setLabelSettings({ ...labelSettings, printerDpi: opt.dpi })}
                        className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          labelSettings.printerDpi === opt.dpi
                            ? 'bg-[#1668B2] border-[#1668B2] text-white'
                            : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* (ب) الباركود */}
              <SectionHeading title="الباركود" withTopDivider />
              <div>
                {renderSettingRow(
                  'عرض وارتفاع الباركود (مم)',
                  'يجب ألا يزيد عرض الباركود عن عرض التكت ولا ارتفاعه عن ارتفاع التكت.',
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--text-secondary)]">العرض:</span>
                      <input
                        type="number"
                        min={10}
                        max={150}
                        value={labelSettings.barcodeWidthMm}
                        aria-label="عرض الباركود بالمليمتر"
                        data-testid="label-barcode-width-input"
                        onChange={(e) =>
                          setLabelSettings({
                            ...labelSettings,
                            barcodeWidthMm: Number(e.target.value)
                          })
                        }
                        className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--text-secondary)]">الارتفاع:</span>
                      <input
                        type="number"
                        min={3}
                        max={100}
                        value={labelSettings.barcodeHeightMm}
                        aria-label="ارتفاع الباركود بالمليمتر"
                        data-testid="label-barcode-height-input"
                        onChange={(e) =>
                          setLabelSettings({
                            ...labelSettings,
                            barcodeHeightMm: Number(e.target.value)
                          })
                        }
                        className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">مم</span>
                  </div>
                )}

                {renderSettingRow(
                  'نوع الباركود',
                  'التلقائي يرسم EAN-13 إذا كان الباركود 13 رقمًا صحيحًا، وإلا يرسم Code128.',
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { id: 'auto', label: 'تلقائي (EAN-13 لو 13 رقم صحيح وإلا Code128)' },
                        { id: 'ean13', label: 'EAN-13' },
                        { id: 'code128', label: 'Code128' }
                      ] as { id: BarcodeType; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`label-barcode-type-${opt.id}`}
                        onClick={() => setLabelSettings({ ...labelSettings, barcodeType: opt.id })}
                        className={`min-h-[40px] px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          labelSettings.barcodeType === opt.id
                            ? 'bg-[#1668B2] border-[#1668B2] text-white'
                            : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* (ج) العناصر وترتيبها */}
              <SectionHeading title="العناصر على التكت وترتيبها" withTopDivider />
              <div className="space-y-3">
                <CompactTable>
                  <thead>
                    <tr>
                      <th className={COMPACT_TABLE_TEXT_CLASS}>العنصر</th>
                      <th className={COMPACT_TABLE_TEXT_CLASS}>يظهر</th>
                      <th className={COMPACT_TABLE_TEXT_CLASS}>الترتيب</th>
                      <th className={COMPACT_TABLE_TEXT_CLASS}>المحاذاة</th>
                      <th className={COMPACT_TABLE_NUM_CLASS}>حجم الخط (pt)</th>
                      <th className={COMPACT_TABLE_TEXT_CLASS}>عريض</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labelSettings.elements.map((el, idx) => {
                      const hasFontControls = el.key !== 'barcode' && el.key !== 'logo';
                      return (
                        <tr key={el.key} data-testid={`label-element-row-${el.key}`}>
                          <td className={`${COMPACT_TABLE_TEXT_CLASS} font-bold text-xs`}>
                            {LABEL_ELEMENT_LABELS[el.key]}
                          </td>
                          <td className={COMPACT_TABLE_TEXT_CLASS}>
                            <label className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={el.show}
                                aria-label={`إظهار ${LABEL_ELEMENT_LABELS[el.key]}`}
                                data-testid={`label-element-show-${el.key}`}
                                onChange={(e) => updateElement(el.key, { show: e.target.checked })}
                                className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                              />
                            </label>
                          </td>
                          <td className={COMPACT_TABLE_TEXT_CLASS}>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveElement(idx, -1)}
                                title="لأعلى"
                                aria-label={`تحريك ${LABEL_ELEMENT_LABELS[el.key]} لأعلى`}
                                data-testid={`label-element-up-${el.key}`}
                                className="min-h-[34px] px-2 rounded border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[11px] font-bold inline-flex items-center gap-0.5 cursor-pointer disabled:opacity-40"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                                <span>لأعلى</span>
                              </button>
                              <button
                                type="button"
                                disabled={idx === labelSettings.elements.length - 1}
                                onClick={() => moveElement(idx, 1)}
                                title="لأسفل"
                                aria-label={`تحريك ${LABEL_ELEMENT_LABELS[el.key]} لأسفل`}
                                data-testid={`label-element-down-${el.key}`}
                                className="min-h-[34px] px-2 rounded border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[11px] font-bold inline-flex items-center gap-0.5 cursor-pointer disabled:opacity-40"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                                <span>لأسفل</span>
                              </button>
                            </div>
                          </td>
                          <td className={COMPACT_TABLE_TEXT_CLASS}>
                            <div className="flex items-center gap-1">
                              {(
                                [
                                  { id: 'right', label: 'يمين' },
                                  { id: 'center', label: 'وسط' },
                                  { id: 'left', label: 'شمال' }
                                ] as { id: LabelAlign; label: string }[]
                              ).map((al) => (
                                <button
                                  key={al.id}
                                  type="button"
                                  data-testid={`label-element-align-${el.key}-${al.id}`}
                                  onClick={() => updateElement(el.key, { align: al.id })}
                                  className={`min-h-[32px] px-2 rounded text-[11px] font-bold border transition cursor-pointer ${
                                    el.align === al.id
                                      ? 'bg-[#1668B2] border-[#1668B2] text-white'
                                      : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                                  }`}
                                >
                                  {al.label}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className={COMPACT_TABLE_NUM_CLASS}>
                            {hasFontControls ? (
                              <input
                                type="number"
                                min={4}
                                max={24}
                                value={el.fontSizePt}
                                aria-label={`حجم خط ${LABEL_ELEMENT_LABELS[el.key]}`}
                                data-testid={`label-element-fontsize-${el.key}`}
                                onChange={(e) =>
                                  updateElement(el.key, { fontSizePt: Number(e.target.value) })
                                }
                                className={`${FORM_CONTROL_BASE_CLASS} w-16 text-center font-mono text-xs font-bold`}
                              />
                            ) : (
                              <span className="text-xs text-[var(--text-secondary)]">—</span>
                            )}
                          </td>
                          <td className={COMPACT_TABLE_TEXT_CLASS}>
                            {hasFontControls ? (
                              <label className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={el.bold}
                                  aria-label={`خط عريض لـ ${LABEL_ELEMENT_LABELS[el.key]}`}
                                  data-testid={`label-element-bold-${el.key}`}
                                  onChange={(e) => updateElement(el.key, { bold: e.target.checked })}
                                  className="w-4 h-4 accent-[#1668B2] cursor-pointer"
                                />
                              </label>
                            ) : (
                              <span className="text-xs text-[var(--text-secondary)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </CompactTable>

                <div>
                  {renderSettingRow(
                    'اسم المحل أو الفرع',
                    'اتركه فارغًا ليُطبع اسم المنشأة تلقائيًا.',
                    <input
                      type="text"
                      maxLength={60}
                      value={labelSettings.shopNameText}
                      onChange={(e) =>
                        setLabelSettings({ ...labelSettings, shopNameText: e.target.value })
                      }
                      placeholder={companySettings.storeName || 'اسم المنشأة'}
                      aria-label="اسم المحل أو الفرع على التكت"
                      data-testid="label-shop-name-input"
                      className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.name} text-xs font-bold`}
                    />
                  )}

                  {renderSettingRow(
                    'اسم الصنف من',
                    'اختر مصدر اسم الصنف المطبوع على التكت (عند اختيار اسم الطباعة أو الوصف وكان فارغًا يُطبع اسم الصنف).',
                    <div className="flex flex-wrap items-center gap-2">
                      {(
                        [
                          { id: 'name', label: 'اسم الصنف' },
                          { id: 'printName', label: 'اسم الطباعة' },
                          { id: 'description', label: 'وصف الصنف' }
                        ] as const
                      ).map((src) => (
                        <button
                          key={src.id}
                          type="button"
                          data-testid={`label-item-name-source-${src.id}`}
                          onClick={() =>
                            setLabelSettings({ ...labelSettings, itemNameSource: src.id })
                          }
                          className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                            labelSettings.itemNameSource === src.id
                              ? 'bg-[#1668B2] border-[#1668B2] text-white'
                              : 'border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                          }`}
                        >
                          {src.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {renderSettingRow(
                    'مقاس الشعار (العرض × الارتفاع بالمليمتر)',
                    companySettings.logoUrl
                      ? 'يستخدم شعار المنشأة المسجل في بيانات المنشأة.'
                      : 'أضف رابط الشعار من صفحة بيانات المنشأة',
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[var(--text-secondary)]">العرض:</span>
                        <input
                          type="number"
                          min={2}
                          max={60}
                          value={labelSettings.logoWidthMm}
                          aria-label="عرض الشعار بالمليمتر"
                          data-testid="label-logo-width-input"
                          onChange={(e) =>
                            setLabelSettings({
                              ...labelSettings,
                              logoWidthMm: Number(e.target.value)
                            })
                          }
                          className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[var(--text-secondary)]">الارتفاع:</span>
                        <input
                          type="number"
                          min={2}
                          max={40}
                          value={labelSettings.logoHeightMm}
                          aria-label="ارتفاع الشعار بالمليمتر"
                          data-testid="label-logo-height-input"
                          onChange={(e) =>
                            setLabelSettings({
                              ...labelSettings,
                              logoHeightMm: Number(e.target.value)
                            })
                          }
                          className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.number} text-center font-mono text-xs font-bold`}
                        />
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">مم</span>
                    </div>
                  )}
                </div>
              </div>

              {/* (هـ) ملاحظة ثابتة لطابعات الرول */}
              <div
                data-testid="label-roll-printer-note"
                className="p-3.5 rounded-lg border border-[var(--border-color)] text-xs font-bold text-[var(--text-secondary)] leading-relaxed"
              >
                في طابعات الرول: اضبط مقاس الورق في تعريف الطابعة على الكمبيوتر بنفس مقاس التكت (أو عرض الصف كله لو أكثر من تكت في الصف)، واختر في نافذة الطباعة: الهوامش بلا، والمقياس 100%
              </div>
            </div>

            {/* (د) عمود المعاينة الحية والطباعة التجريبية */}
            <div className="lg:col-span-5 space-y-3">
              <SectionHeading
                title={`معاينة حية بالمقاس الحقيقي (${labelSettings.labelWidthMm}×${labelSettings.labelHeightMm} مم)`}
                actions={
                  <button
                    type="button"
                    onClick={() => printHtmlInHiddenIframe(singleTestJob.html)}
                    data-testid="label-test-print-btn"
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#1668B2] hover:bg-[#125491] text-white text-xs font-bold transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة تجريبية</span>
                  </button>
                }
              />

              {liveSampleJob.denseBarcodes.length > 0 && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg border border-amber-300 bg-amber-50/80 text-amber-900 text-xs font-bold flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                  <span>
                    خطوط الباركود رفيعة جدًا على هذه الطابعة وقد لا تُقرأ — كبّر عرض الباركود من الإعدادات
                  </span>
                </div>
              )}

              <div className="flex justify-center items-start overflow-x-auto pt-2">
                <iframe
                  title="معاينة التكت الحية"
                  data-testid="label-settings-live-preview-iframe"
                  srcDoc={liveSampleJob.html}
                  className="bg-white border border-[var(--border-color)] rounded shadow-xs"
                  style={{
                    width: `${previewIframeWidthMm}mm`,
                    height: `${previewIframeHeightMm}mm`
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6) صفحة: الضريبة والعمولة */}
      {activeTab === 'tax' && (
        <div className="space-y-5">
          <SectionHeading title="إعدادات الضريبة واحتساب عمولة المنصات" />

          <div>
            {renderSettingRow(
              '1. هل سعر البيع المسجل للصنف شامل الضريبة أم تُضاف الضريبة عليه؟',
              taxSettings.taxInclusive
                ? 'السعر المعروض للعميل يشمل ضريبة القيمة المضافة بالفعل ويُفصل تلقائيًا دون زيادة السعر.'
                : 'سعر البيع هو السعر الصافي وتُضاف نسبة الضريبة المئوية فوق السعر في الفاتورة.',
              <div className="flex flex-wrap items-center gap-4">
                <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="radio"
                    name="taxInclusive"
                    checked={taxSettings.taxInclusive}
                    onChange={() => setTaxSettings({ ...taxSettings, taxInclusive: true })}
                    className="w-4 h-4 accent-[#1668B2]"
                  />
                  <span>شامل الضريبة (Tax Inclusive) [موصى به]</span>
                </label>
                <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="radio"
                    name="taxInclusive"
                    checked={!taxSettings.taxInclusive}
                    onChange={() => setTaxSettings({ ...taxSettings, taxInclusive: false })}
                    className="w-4 h-4 accent-[#1668B2]"
                  />
                  <span>تُضاف الضريبة فوق السعر (Tax Exclusive)</span>
                </label>
              </div>
            )}

            {renderSettingRow(
              '2. طريقة احتساب عمولة المنصة بالنسبة للضريبة',
              taxSettings.platformCommissionOn === 'before_tax'
                ? 'تُحسب نسبة خصم/عمولة المنصة على القيمة الصافية للبضاعة قبل احتساب الضريبة.'
                : 'تقتطع المنصة نسبتها من إجمالي المبلغ الذي يدفعه المستهلك بما فيه الضريبة.',
              <div className="flex flex-wrap items-center gap-4">
                <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="radio"
                    name="platformCommissionOn"
                    checked={taxSettings.platformCommissionOn === 'before_tax'}
                    onChange={() =>
                      setTaxSettings({ ...taxSettings, platformCommissionOn: 'before_tax' })
                    }
                    className="w-4 h-4 accent-[#1668B2]"
                  />
                  <span>قبل الضريبة (على السعر الصافي)</span>
                </label>
                <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="radio"
                    name="platformCommissionOn"
                    checked={taxSettings.platformCommissionOn === 'after_tax'}
                    onChange={() =>
                      setTaxSettings({ ...taxSettings, platformCommissionOn: 'after_tax' })
                    }
                    className="w-4 h-4 accent-[#1668B2]"
                  />
                  <span>بعد الضريبة (على الإجمالي شامل الضريبة)</span>
                </label>
              </div>
            )}
          </div>

          <p className="text-xs text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">ملاحظة التوافق التام: </strong>
            إذا كانت نسبة الضريبة في الصنف 0%، تظل نتائج وحسابات وأرباح الفواتير مطابقة تماماً 100% لمعادلات النظام الأصلية.
          </p>
        </div>
      )}

      {/* 7) صفحة: الخزن المربوطة بالبنك */}
      {activeTab === 'bank_link' && canManageBankLink && (
        <BankLinkSection
          cashboxes={cashboxes}
          users={users}
          formatDateTimeCairo={formatDateTimeCairo}
          canManageTemplatesFallback={canManageBankTemplates}
          onRefreshCashboxes={async () => {
            try {
              const res = await api.getCashboxes();
              if (res?.success && Array.isArray(res.cashboxes)) {
                setCashboxes(res.cashboxes);
              }
            } catch (_) {}
            onSyncAll();
          }}
        />
      )}

      {/* 8) صفحة: قاعدة البيانات والنسخ الاحتياطي وإعادة الضبط */}
      {activeTab === 'integration' && canManageIntegration && (
        <div className="space-y-6">
          <SectionHeading
            title="قاعدة البيانات"
            actions={
              isLoadingDbStatus ? (
                <span className="text-[11px] text-[var(--text-secondary)]">جاري التحديث...</span>
              ) : undefined
            }
          />

          {(dbStatus?.persistenceMode ?? config.persistenceMode) === 'supabase' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Database className="w-4 h-4 text-[var(--primary)] shrink-0" />
                <span className="font-extrabold text-[var(--text-primary)]">حالة قاعدة البيانات:</span>
                <span
                  className={`font-extrabold ${
                    dbStatus?.status?.ready !== false ? 'ui-money-purchase' : 'ui-stock-out'
                  }`}
                >
                  {dbStatus?.status?.ready !== false ? 'متصلة' : 'غير متاحة الآن'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-2 border-y border-[var(--border-subtle)] text-xs">
                <div>
                  <div className="text-[11px] text-[var(--text-secondary)]">عنوان القاعدة</div>
                  <div dir="ltr" className="font-mono font-bold text-[var(--text-primary)] truncate mt-0.5">
                    {dbStatus?.target?.host || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-secondary)]">اسم الشركة</div>
                  <div dir="ltr" className="font-mono font-bold text-[var(--text-primary)] mt-0.5">
                    {dbStatus?.tenant || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-secondary)]">عدد السجلات</div>
                  <div className="font-bold tabular-nums text-[var(--text-primary)] mt-0.5">
                    {dbStatus?.status?.documents ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-secondary)]">آخر حفظ</div>
                  <div className="font-bold text-[var(--text-primary)] mt-0.5">
                    {formatDateTimeCairo(dbStatus?.status?.lastPersistAt)}
                  </div>
                </div>
              </div>

              {dbStatus?.status?.lastError && (
                <div role="alert" className="text-xs font-bold ui-stock-out flex items-center gap-2 py-1">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>آخر خطأ: {dbStatus.status.lastError}</span>
                </div>
              )}
            </div>
          ) : (
            <div
              role="note"
              className="text-xs font-bold ui-stock-low flex items-start gap-2.5 py-1 leading-relaxed"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                وضع المعاينة — لم يتم ربط قاعدة بيانات بعد. لتفعيل الحفظ الدائم اضبط على السيرفر المتغيرات:{' '}
                {(dbStatus?.requiredEnvNames || ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_TENANT_ID']).join(' و ')}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCheckDatabase}
              disabled={isCheckingDb}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-lg bg-[#1668B2] hover:bg-[#125491] text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingDb ? 'animate-spin' : ''}`} />
              <span>{isCheckingDb ? 'جاري الفحص...' : 'فحص الاتصال والتهيئة'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyDatabaseSetupSql}
              disabled={isCopyingSetupSql}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              {setupSqlCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{setupSqlCopied ? 'تم النسخ' : 'نسخ كود التهيئة'}</span>
            </button>

            {dbStatus?.target?.sqlEditorUrl && (
              <a
                href={dbStatus.target.sqlEditorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فتح SQL Editor</span>
              </a>
            )}
          </div>

          {dbActionError && (
            <div role="alert" className="text-xs font-bold ui-stock-out flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{dbActionError}</span>
            </div>
          )}

          {dbCheckResult && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-extrabold text-[var(--text-primary)]">
                  {dbCheckResult.check?.message || dbCheckResult.message}
                </div>
                {typeof dbCheckResult.check?.latencyMs === 'number' && (
                  <span className="font-mono font-bold text-[var(--text-secondary)]">
                    زمن الاستجابة: {dbCheckResult.check.latencyMs} مللي ثانية
                  </span>
                )}
              </div>

              {dbCheckResult.check?.items && dbCheckResult.check.items.length > 0 && (
                <ul className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  {dbCheckResult.check.items.map((item) => (
                    <li key={item.key} className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {item.ok ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <span className="font-bold text-[var(--text-primary)]">{item.label}</span>
                          {item.detail && (
                            <span className="block text-[11px] text-[var(--text-secondary)] mt-0.5">
                              {item.detail}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`font-bold shrink-0 ${item.ok ? 'ui-money-purchase' : 'ui-stock-out'}`}>
                        {item.ok ? 'ناجح' : 'فشل'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-extrabold text-[var(--text-primary)]">
              تجهيز سيرفر أو عميل جديد
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              <li>أنشئ مشروع Supabase (أو استخدم نفس المشروع باسم شركة مختلف).</li>
              <li>الصق كود التهيئة في SQL Editor وشغّله مرة واحدة (غير مطلوب لو نفس المشروع).</li>
              <li>اضبط المتغيرات الثلاثة على السيرفر. SUPABASE_TENANT_ID اسم إنجليزي مميز لكل عميل.</li>
              <li>افتح البرنامج وادخل بالحساب الافتراضي ثم استرجع نسخة احتياطية إن أردت نقل بيانات.</li>
            </ol>
          </div>

          {/* سطر تخزين ونقل الصور */}
          <div
            data-testid="settings-images-storage-row"
            className="pt-3 border-t border-[var(--border-subtle)] space-y-2"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-[var(--text-primary)]">الصور</div>
                <div
                  data-testid="settings-images-storage-status"
                  className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed"
                >
                  {isLoadingImagesStatus && !imagesStatus ? (
                    'جاري فحص حالة الصور...'
                  ) : !imagesStatus || !imagesStatus.storageEnabled ? (
                    'تخزين الصور يعمل بعد ربط قاعدة البيانات'
                  ) : (imagesStatus.inline?.total ?? 0) === 0 ? (
                    <span className="ui-money-purchase font-bold">كل الصور مرفوعة على السيرفر</span>
                  ) : (
                    <span className="ui-stock-low font-bold">
                      {imagesStatus.inline.total} صورة محفوظة داخل البيانات (تبطّئ البرنامج)
                    </span>
                  )}
                </div>
              </div>

              {imagesStatus?.storageEnabled && (imagesStatus.inline?.total ?? 0) > 0 && canManageIntegration && (
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isMigratingImages}
                    onClick={() => void handleMigrateImages()}
                    data-testid="settings-migrate-images-btn"
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-lg bg-[#1668B2] hover:bg-[#125491] text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isMigratingImages ? 'animate-spin' : ''}`} />
                    <span>
                      {isMigratingImages && imagesMigrationProgress
                        ? imagesMigrationProgress
                        : 'نقل الصور للسيرفر'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {imagesMigrationError && (
              <div
                role="alert"
                data-testid="settings-images-migration-error"
                className="text-xs font-bold ui-stock-out flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{imagesMigrationError}</span>
              </div>
            )}

            {imagesMigrationResult && (
              <div
                role="status"
                data-testid="settings-images-migration-result"
                className="text-xs space-y-1 pt-1"
              >
                <div className="font-bold text-[var(--text-primary)]">
                  تم نقل {imagesMigrationResult.moved} صورة
                  {imagesMigrationResult.failed > 0 ? ` • تعذر نقل ${imagesMigrationResult.failed}` : ''}
                  {imagesMigrationResult.remaining > 0 ? ` • متبقي ${imagesMigrationResult.remaining}` : ''}
                </div>
                {Array.isArray(imagesMigrationResult.errors) && imagesMigrationResult.errors.length > 0 && (
                  <ul
                    data-testid="settings-images-migration-errors-list"
                    className="list-disc list-inside text-[11px] ui-stock-out space-y-0.5"
                  >
                    {imagesMigrationResult.errors.map((errText, idx) => (
                      <li key={idx}>{errText}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'integration' && canManageBackup && (
        <div
          id="settings-backup-section"
          ref={backupSectionRef}
          className={
            activeTab === 'integration' && canManageIntegration
              ? 'space-y-6 pt-6 mt-6 scroll-mt-4'
              : 'space-y-6 scroll-mt-4'
          }
        >
          <SectionHeading
            title="النسخ الاحتياطي"
            withTopDivider={activeTab === 'integration' && canManageIntegration}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 border-y border-[var(--border-subtle)] text-xs">
            <div>
              <div className="text-[11px] text-[var(--text-secondary)]">آخر نسخة احتياطية</div>
              <div className="font-bold text-[var(--text-primary)] mt-0.5">
                {backupMeta?.lastBackupAt
                  ? `${formatDateTimeCairo(backupMeta.lastBackupAt)}${
                      backupMeta.lastBackupBy ? ` — بواسطة: ${backupMeta.lastBackupBy}` : ''
                    }`
                  : 'لم يتم أخذ نسخة احتياطية بعد'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-secondary)]">آخر استرجاع</div>
              <div className="font-bold text-[var(--text-primary)] mt-0.5">
                {backupMeta?.lastRestoreAt
                  ? `${formatDateTimeCairo(backupMeta.lastRestoreAt)}${
                      backupMeta.lastRestoreBy ? ` — بواسطة: ${backupMeta.lastRestoreBy}` : ''
                    }`
                  : 'لم يتم استرجاع أي نسخة من قبل'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void downloadBackupNow()}
              disabled={isExportingBackup}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-lg bg-[#168A4A] hover:bg-[#12703C] text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              {isExportingBackup ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isExportingBackup ? 'جاري تجهيز النسخة الاحتياطية...' : 'تنزيل نسخة احتياطية الآن'}</span>
            </button>
          </div>

          {backupSectionFeedback && (
            <div
              role="status"
              className={`text-xs font-bold flex items-center gap-2 ${
                backupSectionFeedback.type === 'success' ? 'ui-money-purchase' : 'ui-stock-out'
              }`}
            >
              {backupSectionFeedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{backupSectionFeedback.message}</span>
            </div>
          )}

          {/* استرجاع نسخة احتياطية */}
          <div className="space-y-4 pt-3 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-extrabold text-[var(--text-primary)]">
              استرجاع نسخة احتياطية
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <label className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{isInspectingBackup ? 'جاري فحص الملف...' : 'اختيار ملف نسخة احتياطية (.gz)'}</span>
                <input
                  type="file"
                  accept=".gz,application/gzip"
                  onChange={handleSelectRestoreFile}
                  disabled={isInspectingBackup || isRestoringBackup}
                  className="hidden"
                />
              </label>
              {restoreFileName && (
                <span dir="ltr" className="text-xs font-mono font-bold text-[var(--text-secondary)]">
                  {restoreFileName}
                </span>
              )}
            </div>

            {restoreError && (
              <div role="alert" className="text-xs font-bold ui-stock-out flex items-center gap-2 py-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{restoreError}</span>
              </div>
            )}

            {restoreSuccessMessage && (
              <div role="status" className="text-xs font-bold ui-money-purchase flex items-center gap-2 py-1">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{restoreSuccessMessage}</span>
              </div>
            )}

            {inspectedBackup && (
              <div className="space-y-4 pt-3 border-t border-[var(--border-subtle)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs py-2 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="text-[11px] text-[var(--text-secondary)]">تاريخ النسخة</div>
                    <div className="font-bold text-[var(--text-primary)] mt-0.5">
                      {formatDateTimeCairo(inspectedBackup.summary.createdAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--text-secondary)]">من أخذها</div>
                    <div className="font-bold text-[var(--text-primary)] mt-0.5">
                      {inspectedBackup.summary.createdBy || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--text-secondary)]">اسم المتجر</div>
                    <div className="font-bold text-[var(--text-primary)] mt-0.5">
                      {inspectedBackup.summary.storeName || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--text-secondary)]">اسم الشركة</div>
                    <div dir="ltr" className="font-mono font-bold text-[var(--text-primary)] mt-0.5">
                      {inspectedBackup.summary.tenant || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--text-secondary)]">إجمالي السجلات</div>
                    <div className="font-bold tabular-nums text-[var(--text-primary)] mt-0.5">
                      {inspectedBackup.summary.totalRecords}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-[var(--text-primary)]">
                  <span>الأصناف: {inspectedBackup.summary.counts?.items ?? 0}</span>
                  <span>الفواتير: {inspectedBackup.summary.counts?.invoices ?? 0}</span>
                  <span>العملاء: {inspectedBackup.summary.counts?.customers ?? 0}</span>
                  <span>الموردون: {inspectedBackup.summary.counts?.suppliers ?? 0}</span>
                  <span>المستخدمون: {inspectedBackup.summary.counts?.users ?? 0}</span>
                </div>

                {inspectedBackup.tenantMismatch && (
                  <div role="alert" className="text-xs font-bold ui-stock-low flex items-center gap-2 py-1">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      هذه النسخة من شركة أخرى ({inspectedBackup.summary.tenant}). استرجاعها سيستبدل بيانات هذه الشركة
                    </span>
                  </div>
                )}

                <div role="alert" className="text-xs font-bold ui-stock-out leading-relaxed py-1">
                  الاسترجاع يستبدل كل بيانات الشركة الحالية بمحتوى الملف ولا يمكن التراجع عنه. كلمات السر ترجع كما كانت وقت النسخة، وكل المستخدمين سيسجلون الدخول من جديد.
                </div>

                {restoreStage === 'summary' && (
                  <div>
                    <button
                      type="button"
                      onClick={() => void handleProceedToRestoreConfirm()}
                      disabled={isTakingPreRestoreBackup || isExportingBackup}
                      className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      {isTakingPreRestoreBackup ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>
                        {isTakingPreRestoreBackup
                          ? 'جاري تنزيل نسخة من الوضع الحالي أولًا...'
                          : 'متابعة'}
                      </span>
                    </button>
                  </div>
                )}

                {restoreStage === 'confirm' && (
                  <form onSubmit={handleExecuteRestore} className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                      <div>
                        <label
                          htmlFor="restore-current-password"
                          className="block text-xs font-bold text-[var(--text-primary)] mb-1"
                        >
                          كلمة سر المستخدم الحالي
                        </label>
                        <input
                          id="restore-current-password"
                          type="password"
                          required
                          value={restorePassword}
                          onChange={(e) => setRestorePassword(e.target.value)}
                          placeholder="أدخل كلمة السر الحالية للتأكيد"
                          className={`${FORM_CONTROL_BASE_CLASS} w-full text-xs`}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="restore-confirm-word"
                          className="block text-xs font-bold text-[var(--text-primary)] mb-1"
                        >
                          اكتب كلمة «استرجاع» للتأكيد
                        </label>
                        <input
                          id="restore-confirm-word"
                          type="text"
                          required
                          value={restoreConfirmText}
                          onChange={(e) => setRestoreConfirmText(e.target.value)}
                          placeholder="استرجاع"
                          className={`${FORM_CONTROL_BASE_CLASS} w-full text-xs font-bold`}
                        />
                      </div>
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={isRestoringBackup || !restorePassword || restoreConfirmText.trim() !== 'استرجاع'}
                        className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        {isRestoringBackup ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        <span>{isRestoringBackup ? 'جاري الاسترجاع...' : 'استرجاع الآن'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'integration' && (canManageIntegration || canManageBackup) && (
        <div className="mt-6">{renderOfflineBackupSection()}</div>
      )}

      {activeTab === 'integration' && canManageReset && (
        <div
          className={
            activeTab === 'integration' && (canManageIntegration || canManageBackup)
              ? 'pt-6 mt-6 border-t border-[var(--border-subtle)]'
              : ''
          }
        >
          <SystemResetSection
            canResetOperations={canResetOperations}
            canFactoryReset={canFactoryReset}
            canManageBackup={canManageBackup}
            onDownloadBackup={downloadBackupNow}
            onResetComplete={onForceLogoutAfterReset || onLogout}
            formatDateTimeCairo={formatDateTimeCairo}
          />
        </div>
      )}

      {/* 9) صفحة: اختصارات لوحة المفاتيح */}
      {activeTab === 'shortcuts' && canManageShortcuts && (
        <div className="space-y-4">
          <SectionHeading
            title="إدارة اختصارات لوحة المفاتيح العامة"
            actions={
              <button
                type="button"
                disabled={!canManageShortcuts || isSavingShortcuts}
                onClick={handleResetShortcutsToDefault}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة الافتراضي</span>
              </button>
            }
          />

          {renderSettingRow(
            'تفعيل الاختصارات',
            'مفتاح عام لتشغيل أو إيقاف جميع اختصارات لوحة المفاتيح في البرنامج كله لكل المستخدمين.',
            <button
              type="button"
              role="switch"
              aria-checked={shortcutsSettings.enabled}
              disabled={!canManageShortcuts || isSavingShortcuts}
              onClick={handleToggleMasterShortcuts}
              className="min-h-[44px] inline-flex items-center gap-3 cursor-pointer disabled:opacity-50"
            >
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {shortcutsSettings.enabled ? 'مفعّل' : 'متوقف'}
              </span>
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  shortcutsSettings.enabled ? 'bg-[#168A4A]' : 'bg-slate-400'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    shortcutsSettings.enabled ? '-translate-x-5' : '-translate-x-1'
                  }`}
                />
              </span>
            </button>
          )}

          {shortcutsFeedback && (
            <div
              role="status"
              className={`text-xs font-bold flex items-center justify-between gap-2 py-2 border-b border-[var(--border-subtle)] ${
                shortcutsFeedback.type === 'success' ? 'ui-money-purchase' : 'ui-stock-out'
              }`}
            >
              <div className="flex items-center gap-2">
                {shortcutsFeedback.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{shortcutsFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsFeedback(null)}
                className="min-h-[36px] px-2 text-xs underline cursor-pointer shrink-0"
              >
                إغلاق
              </button>
            </div>
          )}

          <CompactTable ariaLabel="جدول اختصارات لوحة المفاتيح">
            <thead>
              <tr>
                <th className={`text-right ${COMPACT_TABLE_TEXT_CLASS}`}>الإجراء</th>
                <th className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>المفتاح الحالي</th>
                <th className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>تغيير</th>
                <th className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>تشغيل / إيقاف</th>
              </tr>
            </thead>
            <tbody>
              {KEYBOARD_SHORTCUT_GROUPS.map((group) => {
                const groupDefs = KEYBOARD_SHORTCUT_DEFINITIONS.filter(
                  (d) => d.groupId === group.id
                );
                return (
                  <React.Fragment key={group.id}>
                    <tr className="bg-[var(--surface-subtle)]">
                      <td
                        colSpan={4}
                        className="py-2 px-3 text-xs font-extrabold text-[var(--text-primary)] border-y border-[var(--border-color)]"
                      >
                        {group.title}
                      </td>
                    </tr>
                    {groupDefs.map((def) => {
                      const binding = shortcutsSettings.bindings[def.id] || {
                        key: def.defaultKey,
                        enabled: def.defaultEnabled
                      };
                      const isCapturingThis = capturingActionId === def.id;
                      const isEffectiveEnabled =
                        shortcutsSettings.enabled && Boolean(binding.enabled);

                      return (
                        <tr
                          key={def.id}
                          className={
                            !shortcutsSettings.enabled || !binding.enabled ? 'opacity-65' : ''
                          }
                        >
                          <td className={COMPACT_TABLE_TEXT_CLASS}>
                            <div className="font-bold text-xs text-[var(--text-primary)]">
                              {def.label}
                            </div>
                            {def.description && (
                              <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                {def.description}
                              </div>
                            )}
                          </td>

                          <td className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>
                            {isCapturingThis ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#1668B2] text-[#1668B2] font-bold text-xs animate-pulse">
                                <Keyboard className="w-3.5 h-3.5" />
                                <span>اضغط المفتاح... (Esc للإلغاء)</span>
                              </span>
                            ) : (
                              <kbd
                                dir="ltr"
                                className={`inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded border font-mono text-xs font-extrabold ${
                                  isEffectiveEnabled
                                    ? 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] line-through'
                                }`}
                              >
                                {def.fixed ? def.defaultKey : binding.key}
                              </kbd>
                            )}
                          </td>

                          <td className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>
                            {def.fixed ? (
                              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                                ثابت لا يُعدَّل
                              </span>
                            ) : isCapturingThis ? (
                              <button
                                type="button"
                                onClick={() => setCapturingActionId(null)}
                                className="min-h-[38px] px-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-xs font-bold ui-stock-out cursor-pointer"
                              >
                                إلغاء
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!canManageShortcuts || isSavingShortcuts}
                                onClick={() => {
                                  setShortcutsFeedback(null);
                                  setCapturingActionId(def.id);
                                }}
                                className="min-h-[38px] px-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-xs font-bold ui-link cursor-pointer disabled:opacity-50"
                              >
                                تغيير
                              </button>
                            )}
                          </td>

                          <td className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={binding.enabled}
                              aria-label={`تشغيل أو إيقاف ${def.label}`}
                              disabled={!canManageShortcuts || isSavingShortcuts}
                              onClick={() => handleToggleSingleShortcut(def.id)}
                              className="min-h-[38px] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                              <span
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  binding.enabled ? 'bg-[#168A4A]' : 'bg-slate-400'
                                }`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                    binding.enabled ? '-translate-x-4' : '-translate-x-1'
                                  }`}
                                />
                              </span>
                              <span className="text-[11px] font-bold text-[var(--text-secondary)] min-w-[34px] text-right">
                                {binding.enabled ? 'مفعّل' : 'متوقف'}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </CompactTable>
        </div>
      )}

      {/* صفحة إدارة المستخدمين (تحت قائمة الصلاحيات /settings/users) */}
      {activeTab === 'users' && canManageUsers && (
        <div className="space-y-4">
          <SectionHeading
            title="إدارة المستخدمين والحسابات وتعيين الخزائن"
            actions={
              canCreateUser ? (
                <button
                  type="button"
                  data-shortcut-add="true"
                  onClick={handleOpenCreateUser}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-lg bg-[#168A4A] hover:bg-[#12703C] text-white font-bold text-xs transition cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>إضافة مستخدم وتعيين الخزائن</span>
                  <ShortcutBadge actionId="general.add_new" className="!text-white/90 !border-white/35 !bg-white/10" />
                </button>
              ) : undefined
            }
          />

          <div className="flex flex-wrap items-end gap-3 pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <label
                htmlFor="users-search-input"
                className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
              >
                بحث
              </label>
              <input
                id="users-search-input"
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="الاسم أو @المستخدم أو الهاتف..."
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs`}
              />
            </div>

            <div>
              <label
                htmlFor="users-role-filter"
                className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
              >
                الدور
              </label>
              <select
                id="users-role-filter"
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as 'ALL' | UserRole)}
                className={`${FORM_CONTROL_BASE_CLASS} ${INPUT_WIDTH_CLASSES.code} text-xs font-semibold`}
              >
                <option value="ALL">الكل ({users.length})</option>
                <option value="designer">مصمم / مالك</option>
                <option value="manager">مدير</option>
                <option value="employee">موظف</option>
              </select>
            </div>
          </div>

          {userActionFeedback && (
            <div
              role="status"
              className={`text-xs font-bold flex items-center gap-2 ${
                userActionFeedback.type === 'success' ? 'ui-money-purchase' : 'ui-stock-out'
              }`}
            >
              {userActionFeedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{userActionFeedback.message}</span>
            </div>
          )}

          <CompactTable ariaLabel="جدول المستخدمين والحسابات">
            <thead>
              <tr>
                <th className={`text-right ${COMPACT_TABLE_TEXT_CLASS}`}>المستخدم والاسم</th>
                <th className={`text-right ${COMPACT_TABLE_NUM_CLASS}`}>رقم الهاتف</th>
                <th className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>الدور</th>
                <th className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>الصلاحيات</th>
                <th className={`text-right ${COMPACT_TABLE_TEXT_CLASS}`}>الخزائن المعينة بالعمليات</th>
                <th className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>الحالة</th>
                <th className={`text-center ${COMPACT_TABLE_NUM_CLASS}`}>الإجراءات والتحكم</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isOwnerUser = u.role === 'designer' || u.isOwner;
                const isActive = u.status === 'active' || (u.status as any) === 'نشط';
                const isBusy = statusToggleLoadingId === u.id;
                const cfg = u.cashboxConfig;

                const saleDefaultName = cashboxes.find((c) => c.id === cfg?.defaultSaleCashboxId)?.name;
                const returnDefaultName = cashboxes.find((c) => c.id === cfg?.defaultReturnCashboxId)?.name;

                return (
                  <tr key={u.id}>
                    <td className={COMPACT_TABLE_TEXT_CLASS}>
                      <div className="font-bold text-[var(--text-primary)]">
                        {u.name}
                        {isOwnerUser && (
                          <span className="mr-1.5 text-[11px] ui-stock-low font-bold">
                            • مصمم النظام
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                        @{u.username}
                        {u.mustChangePassword ? ' • يلزم تغيير كلمة السر' : ''}
                      </div>
                    </td>

                    <td className={`font-mono text-[var(--text-secondary)] ${COMPACT_TABLE_NUM_CLASS}`}>
                      {u.phone || '—'}
                    </td>

                    <td className={`text-center font-bold ${COMPACT_TABLE_NUM_CLASS}`}>
                      {u.role === 'designer' ? 'مصمم / مالك' : u.role === 'manager' ? 'مدير' : 'موظف'}
                    </td>

                    <td className={`text-center font-mono text-[var(--text-secondary)] ${COMPACT_TABLE_NUM_CLASS}`}>
                      {isOwnerUser ? (
                        <span className="ui-stock-low font-bold">كاملة</span>
                      ) : (
                        <span>{(u.permissions || []).length} صلاحية</span>
                      )}
                    </td>

                    <td className={`text-xs ${COMPACT_TABLE_TEXT_CLASS}`}>
                      {isOwnerUser ? (
                        <span className="ui-stock-low font-bold">صلاحية كاملة لجميع الخزائن</span>
                      ) : cfg ? (
                        <div className="space-y-0.5 text-[11px]">
                          <div>
                            <span className="font-bold">البيع: </span>
                            {saleDefaultName ? (
                              <span className="ui-link font-semibold">{saleDefaultName}</span>
                            ) : (
                              <span className="text-[var(--text-secondary)]">غير معينة</span>
                            )}
                            {(cfg.allowedSaleCashboxIds || []).length > 1 && (
                              <span className="text-[var(--text-secondary)]">
                                {' '}
                                (+{cfg.allowedSaleCashboxIds.length - 1})
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="font-bold">المرتجع: </span>
                            {returnDefaultName ? (
                              <span className="ui-stock-out font-semibold">{returnDefaultName}</span>
                            ) : (
                              <span className="text-[var(--text-secondary)]">غير معينة</span>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--text-secondary)]">
                            قبض: {(cfg.allowedReceiptCashboxIds || []).length} • صرف:{' '}
                            {(cfg.allowedPaymentCashboxIds || []).length} • تحويل:{' '}
                            {(cfg.allowedTransferCashboxIds || []).length}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--text-secondary)]">لم تُعيّن خزائن محددة</span>
                      )}
                    </td>

                    <td className={`text-center font-bold ${COMPACT_TABLE_NUM_CLASS}`}>
                      <span className={isActive ? 'ui-money-purchase' : 'ui-stock-out'}>
                        {isActive ? 'نشط' : 'موقوف'}
                      </span>
                    </td>

                    <td className={COMPACT_TABLE_NUM_CLASS}>
                      <div className="flex items-center justify-center gap-1.5">
                        {canEditUser && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditUser(u)}
                            className="min-h-[44px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] ui-link font-bold text-xs cursor-pointer"
                            title="تعديل البيانات وتعيين الخزائن والصلاحيات"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u)}
                          disabled={isBusy}
                          className={`min-h-[44px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] font-bold text-xs cursor-pointer ${
                            isActive ? 'ui-stock-out' : 'ui-money-purchase'
                          }`}
                          title={isActive ? 'إيقاف المستخدم وإنهاء جلساته فورياً' : 'تنشيط المستخدم وتمكينه من الدخول'}
                        >
                          <Power className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                          <span>{isActive ? 'إيقاف' : 'تنشيط'}</span>
                        </button>

                        {canDeleteUser && (
                          <button
                            type="button"
                            onClick={() => setUserToDelete(u)}
                            disabled={isBusy}
                            className="min-h-[44px] inline-flex items-center gap-1 px-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] ui-stock-out font-bold text-xs cursor-pointer"
                            title="حذف حساب المستخدم"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--text-secondary)] py-8">
                    لا يوجد مستخدمون مطابقون للبحث أو التصفية
                  </td>
                </tr>
              )}
            </tbody>
          </CompactTable>
        </div>
      )}

      {/* شريط الحفظ الموحّد المثبت أسفل الصفحات 1–6 */}
      {isSaveBarSupportedTab && (isActiveTabDirty || isSavingAll || Boolean(saveBarFeedback)) && (
        <div
          data-testid="settings-sticky-save-bar"
          className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mt-6 border-t border-[var(--border-color)] bg-[var(--surface)] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-xs font-bold">
            {saveBarFeedback?.type === 'error' ? (
              <span role="alert" className="ui-stock-out flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{saveBarFeedback.message}</span>
              </span>
            ) : saveBarFeedback?.type === 'success' && !isActiveTabDirty ? (
              <span role="status" className="ui-money-purchase flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{saveBarFeedback.message}</span>
              </span>
            ) : isActiveTabDirty ? (
              <span className="text-[var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span>يوجد تغييرات غير محفوظة</span>
              </span>
            ) : null}
          </div>

          {(isActiveTabDirty || isSavingAll) && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSavingAll}
                onClick={handleRevertActiveTab}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[var(--text-primary)] font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تراجع</span>
              </button>

              <button
                type="button"
                data-shortcut-save="true"
                disabled={isSavingAll}
                onClick={handleUnifiedSave}
                className="min-h-[44px] inline-flex items-center gap-2 px-6 rounded-lg bg-[#168A4A] hover:bg-[#12703C] text-white font-bold text-xs transition cursor-pointer disabled:opacity-60"
              >
                {isSavingAll ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{isSavingAll ? 'جاري الحفظ...' : 'حفظ'}</span>
                <ShortcutBadge actionId="general.save_form" className="!text-white/90 !border-white/35 !bg-white/10" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* نوافذ تأكيد داخلية */}
      <UserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        userToEdit={userToEdit}
        currentUser={currentUser}
        activeCashboxes={cashboxes}
        onSave={handleSaveUserFromModal}
      />

      {isMotionTestModalOpen && (
        <ModalShell
          title="اختبار المؤثرات الحركية والتفاعل"
          subtitle={
            currentMotion === 'on'
              ? 'المؤثرات مفعّلة (120-220ms)'
              : 'المؤثرات متوقفة (0s استجابة فورية)'
          }
          onClose={() => setIsMotionTestModalOpen(false)}
          footer={
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleToggleMotion(currentMotion === 'on' ? 'off' : 'on')}
                className="min-h-[44px] px-3 text-xs ui-link hover:underline font-bold cursor-pointer"
              >
                {currentMotion === 'on' ? 'جرّب إيقاف المؤثرات الآن' : 'جرّب تشغيل المؤثرات الآن'}
              </button>
              <button
                type="button"
                onClick={() => setIsMotionTestModalOpen(false)}
                className="min-h-[44px] px-5 rounded-lg bg-[#1668B2] hover:bg-[#125491] text-white font-bold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs max-w-md">
            <p className="text-[var(--text-secondary)] leading-relaxed">
              {currentMotion === 'on'
                ? 'لاحظ الانسيابية الهادئة في تلاشي الخلفية وظهور النافذة بتكبير ناعم بدون وميض.'
                : 'لاحظ ظهور النافذة فوراً دون أي انزلاق أو تأخير حركي استجابة لتعطيل الحركة.'}
            </p>
            <button
              type="button"
              className="min-h-[44px] px-4 rounded-lg bg-[#1668B2] text-white font-bold text-xs active:scale-95 transition"
            >
              زر تجريبي لاختبار الضغط البصري
            </button>
          </div>
        </ModalShell>
      )}

      {isConfirmingNegativeStock && (
        <ModalShell
          title="تأكيد تفعيل البيع بالسالب"
          subtitle="سياسة المخزون وقواعد المبيعات"
          onClose={() => setIsConfirmingNegativeStock(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsConfirmingNegativeStock(false)}
                className="min-h-[44px] px-4 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  setStockSettings((prev) => ({ ...prev, allowNegativeStockSale: true }));
                  setIsConfirmingNegativeStock(false);
                }}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold cursor-pointer"
              >
                <span>نعم، تفعيل البيع بالسالب</span>
              </button>
            </>
          }
        >
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md">
            <strong className="ui-stock-low block mb-1">تنبيه محاسبي ومخزني هام:</strong>
            تفعيل هذا الإعداد يسمح لجميع المستخدمين ببيع أصناف تفوق الكميات المتوفرة فعلياً في المخزن، مما يتسبب في نزول رصيد المخزون إلى قيم سالبة تحت الصفر. هل أنت متأكد من تفعيل هذا الإجراء؟
          </p>
        </ModalShell>
      )}

      {isConfirmingNegativeTransfer && (
        <ModalShell
          title="تأكيد تفعيل التحويل بالسالب بين المخازن"
          subtitle="سياسة المخزون وضوابط أوامر الصرف"
          onClose={() => setIsConfirmingNegativeTransfer(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsConfirmingNegativeTransfer(false)}
                className="min-h-[44px] px-4 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  setStockSettings((prev) => ({ ...prev, allowNegativeWarehouseTransfer: true }));
                  setIsConfirmingNegativeTransfer(false);
                }}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold cursor-pointer"
              >
                <span>نعم، تفعيل التحويل بالسالب</span>
              </button>
            </>
          }
        >
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md">
            <strong className="ui-stock-low block mb-1">تنبيه مخزني هام:</strong>
            تفعيل هذا الإعداد يسمح للمخوّلين بصلاحية التحويل بنقل كميات تفوق المتاح في المخزن المحوِّل، مما يؤدي إلى نزول رصيد ذلك المخزن إلى السالب. هل أنت متأكد من تفعيل هذا الإعداد؟
          </p>
        </ModalShell>
      )}

      {userToDelete && (
        <ModalShell
          title="تأكيد حذف المستخدم"
          subtitle="إجراء إداري دائم على الحساب"
          onClose={() => !isDeletingUser && setUserToDelete(null)}
          closeDisabled={isDeletingUser}
          footer={
            <>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="min-h-[44px] px-4 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={handleConfirmDeleteUser}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-lg bg-[#D9524F] hover:bg-[#B42318] text-white text-xs font-bold cursor-pointer"
              >
                {isDeletingUser && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>تأكيد الحذف</span>
              </button>
            </>
          }
        >
          <div className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md space-y-1">
            <p className="font-bold ui-stock-out">
              هل أنت متأكد من رغبتك في حذف حساب «{userToDelete.name}» (@{userToDelete.username})؟
            </p>
            <p>سيتم إنهاء أي جلسات نشطة لهذا المستخدم فورًا. يُمنع حذف آخر حساب مالك نشط للنظام.</p>
          </div>
        </ModalShell>
      )}

      {visitorSlideToDelete && (
        <ModalShell
          title="تأكيد حذف صورة العرض"
          subtitle="إجراء فوري على صور شاشة الزوار"
          onClose={() => !isDeletingVisitorSlide && setVisitorSlideToDelete(null)}
          closeDisabled={isDeletingVisitorSlide}
          footer={
            <>
              <button
                type="button"
                disabled={isDeletingVisitorSlide}
                onClick={() => setVisitorSlideToDelete(null)}
                className="min-h-[44px] px-4 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeletingVisitorSlide}
                onClick={() => void handleConfirmDeleteVisitorSlide()}
                data-testid="visitor-confirm-delete-slide-btn"
                className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-lg bg-[#D9524F] hover:bg-[#B42318] text-white text-xs font-bold cursor-pointer"
              >
                {isDeletingVisitorSlide && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>تأكيد الحذف</span>
              </button>
            </>
          }
        >
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md">
            هل أنت متأكد من حذف هذه الصورة من شاشة الزوار؟
          </p>
        </ModalShell>
      )}
    </PageSurface>
  );
};
