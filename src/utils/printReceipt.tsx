/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Invoice, CompanySettings, InvoicePrintSettings, Customer, Item } from '../types';
import { ReceiptPrintArea } from '../components/ReceiptPrintArea';

export interface PrintReceiptOptions {
  companySettings?: CompanySettings;
  invoicePrintSettings?: InvoicePrintSettings;
  storeName?: string;
  isReprint?: boolean;
  customers?: Customer[];
  items?: Item[];
  changeGiven?: number;
  customerBalanceAfter?: number;
  onAfterPrint?: () => void;
}

/**
 * وظيفة طباعة الإيصال المعزولة تماماً:
 * 1. إنشاء عنصر div مؤقت مضاف مباشرة لـ document.body خارج شجرة React الأساسية
 * 2. استخدام createRoot لرسم ReceiptPrintArea داخله
 * 3. قياس الطول بدقة والطباعة عبر window.print
 * 4. إلغاء التثبيت وحذف العنصر المؤقت والستايل دائماً عبر try / finally
 */
export async function printReceipt(
  invoice: Invoice,
  options?: PrintReceiptOptions
): Promise<void> {
  const paperSize = options?.invoicePrintSettings?.paperSize ?? '80mm';
  const defaultWidth = paperSize === '58mm' ? 48 : paperSize === '80mm' ? 72 : 190;
  const printableWidthMm = options?.invoicePrintSettings?.printableWidthMm ?? defaultWidth;

  // 1. عنصر مؤقت يُضاف مباشرة لـ document.body خارج شجرة صفحة البيع
  const printContainer = document.createElement('div');
  printContainer.id = 'pos-receipt-print-container';
  printContainer.style.position = 'fixed';
  printContainer.style.top = '0';
  printContainer.style.left = '-10000px';
  printContainer.style.width = `${printableWidthMm}mm`;
  printContainer.style.visibility = 'hidden';
  printContainer.style.pointerEvents = 'none';
  printContainer.style.zIndex = '-1';
  printContainer.style.boxSizing = 'border-box';
  printContainer.style.margin = '0 auto';
  printContainer.style.padding = '0';
  printContainer.style.overflow = 'visible';

  document.body.appendChild(printContainer);

  const root = createRoot(printContainer);

  try {
    // 2. رسم ReceiptPrintArea بواسطة createRoot
    await new Promise<void>((resolve) => {
      root.render(
        <div className="receipt-print-area">
          <ReceiptPrintArea
            invoice={invoice}
            companySettings={options?.companySettings}
            invoicePrintSettings={options?.invoicePrintSettings}
            storeName={options?.storeName || options?.companySettings?.storeName || 'مدقق للنظم'}
            isReprint={options?.isReprint}
            customers={options?.customers}
            items={options?.items}
            changeGiven={options?.changeGiven}
            customerBalanceAfter={options?.customerBalanceAfter}
            onLogoLoad={resolve}
          />
        </div>
      );

      // انتظر إطارين لضمان انتهاء React من إلحاق العناصر بالـ DOM
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });

    // انتظر الخطوط
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    } catch (_) {}

    // انتظار تحميل وفك تشفير الصور
    const images = Array.from(printContainer.querySelectorAll('img'));
    await Promise.all(
      images.map(async (img) => {
        try {
          if (!img.complete) {
            await new Promise<void>((res) => {
              const onDone = () => {
                img.removeEventListener('load', onDone);
                img.removeEventListener('error', onDone);
                res();
              };
              img.addEventListener('load', onDone);
              img.addEventListener('error', onDone);
            });
          }
          if (typeof img.decode === 'function') {
            await img.decode();
          }
        } catch (_) {}
      })
    );

    // reflow
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // 3. قياس الطول إن لم تكن الورقة A4
    let heightMm: number | null = null;
    if (paperSize !== 'a4') {
      const heightPx = printContainer.scrollHeight || printContainer.offsetHeight;
      if (heightPx && heightPx > 0) {
        heightMm = Math.ceil((heightPx * 25.4) / 96 + 8);
      }
    }

    // 4. توليد ستايل الطباعة وحقنه
    const prevStyle = document.getElementById('print-page-style');
    if (prevStyle) prevStyle.remove();

    const paperWidthMm = paperSize === '58mm' ? 58 : paperSize === 'custom' ? (printableWidthMm || 80) : 80;
    const sizeRule = paperSize === 'a4'
      ? 'size: A4; margin: 10mm;'
      : heightMm && heightMm > 0
      ? `size: ${paperWidthMm}mm ${heightMm}mm; margin: 0;`
      : `size: ${paperWidthMm}mm; margin: 0;`;

    const pageCss = `
      @page {
        ${sizeRule}
      }
      @media print {
        /* إخفاء كامل الصفحة باستثناء حاوية الإيصال المنفصلة */
        body > *:not(#pos-receipt-print-container) {
          display: none !important;
        }
        html, body {
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        #pos-receipt-print-container {
          position: static !important;
          left: 0 !important;
          top: 0 !important;
          visibility: visible !important;
          display: block !important;
          width: ${printableWidthMm}mm !important;
          max-width: ${printableWidthMm}mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          z-index: 99999 !important;
          pointer-events: auto !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #pos-receipt-print-container .receipt-print-area {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 2mm !important;
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #pos-receipt-print-container .receipt-print-area > div,
        #pos-receipt-print-container .receipt-table,
        #pos-receipt-print-container .receipt-table thead,
        #pos-receipt-print-container .receipt-table tbody,
        #pos-receipt-print-container .receipt-table tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.id = 'print-page-style';
    styleEl.innerHTML = pageCss;
    document.head.appendChild(styleEl);

    // 5. استدعاء أمر الطباعة وانتظار اكتماله
    await new Promise<void>((resolvePrint) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('afterprint', done);
        resolvePrint();
      };
      window.addEventListener('afterprint', done);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            window.print();
          } catch (_) {
            done();
          }
          // مؤقت أمان احتياطي إن لم يعمل بعد الطباعة
          setTimeout(done, 1500);
        });
      });
    });
  } finally {
    // 6. الإلغاء والتنظيف الإلزامي في try / finally
    try {
      root.unmount();
    } catch (_) {}
    if (printContainer.parentNode) {
      printContainer.parentNode.removeChild(printContainer);
    }
    const injected = document.getElementById('print-page-style');
    if (injected) injected.remove();

    options?.onAfterPrint?.();
  }
}
