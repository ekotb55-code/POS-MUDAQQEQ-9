/**
 * سجل شاشة البيع على الجهاز — POS مدقق
 * ---------------------------------------------------------------------------
 * كل تغيير في الفاتورة المفتوحة (ضرب صنف، حذف، تقليل كمية، تفريغ) يُكتب فورًا
 * على الجهاز برقم مسلسل، ثم يُرفع للسيرفر في الخلفية:
 *   - الإنترنت موجود: خلال ثانية تقريبًا.
 *   - الإنترنت مقطوع: يبقى على الجهاز ويُرفع تلقائيًا عند رجوع الاتصال.
 * شاشة البيع لا تنتظر السيرفر أبدًا.
 *
 * الاستخدام من شاشة البيع:
 *   journal.syncCart(lines, meta)   ← عند كل تغيير في أصناف الفاتورة
 *   journal.currentCartId()         ← يُرسل مع طلب حفظ الفاتورة في الحقل cartId
 *   journal.cartSaved()             ← بعد نجاح حفظ الفاتورة (أونلاين أو في صندوق الأوفلاين)
 *   journal.closeCart('logout')     ← عند تسجيل الخروج والفاتورة فيها أصناف
 */

export interface JournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CartLineInput {
  itemId: string;
  name?: string;
  barcode?: string;
  unitPrice?: number;
  quantity: number;
}

export interface CartMeta {
  warehouseId?: string;
  warehouseName?: string;
  platform?: string;
}

export interface JournalEvent {
  seq: number;
  at: string;
  cartId: string;
  type: 'qty' | 'clear' | 'close';
  itemId?: string;
  itemName?: string;
  barcode?: string;
  unitPrice?: number;
  qty?: number;
  reason?: 'page_close' | 'logout' | 'crash' | 'other';
  warehouseId?: string;
  warehouseName?: string;
  platform?: string;
}

export interface CartJournalClientOptions {
  storage: JournalStorage;
  /** يرسل الدفعة للسيرفر ويرجع آخر رقم مسلسل استلمه السيرفر. يرمي خطأ عند الفشل */
  send: (payload: { deviceId: string; events: JournalEvent[] }, options: { keepalive: boolean }) => Promise<{ lastSeq: number }>;
  now?: () => number;
  randomId?: () => string;
  flushDelayMs?: number;
  retryMs?: number;
  /** false في الاختبارات: بدون مؤقتات ولا مستمعي أحداث المتصفح */
  autoTimers?: boolean;
}

interface CartSnapshot {
  cartId: string;
  items: Record<string, number>;
  lastAt: number;
  heartbeat: number;
  closed: boolean;
}

const KEY_DEVICE = 'mq_cj_device';
const KEY_SEQ = 'mq_cj_seq';
const KEY_PENDING = 'mq_cj_pending';
const KEY_CARTS = 'mq_cj_carts';
const KEY_CART_PREFIX = 'mq_cj_cart_';
const MAX_PENDING = 20000;
const BATCH_SIZE = 200;
const HEARTBEAT_MS = 5000;
const ORPHAN_AFTER_MS = 30000;

function defaultRandomId(): string {
  const cryptoObj: any = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return String(cryptoObj.randomUUID()).replace(/-/g, '').slice(0, 24);
  }
  let out = '';
  while (out.length < 24) out += Math.random().toString(36).slice(2);
  return out.slice(0, 24);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export class CartJournalClient {
  private storage: JournalStorage;
  private send: CartJournalClientOptions['send'];
  private now: () => number;
  private randomId: () => string;
  private flushDelayMs: number;
  private retryMs: number;
  private autoTimers: boolean;
  private deviceId: string;
  private cartId: string;
  private items = new Map<string, { qty: number; name: string; barcode: string; unitPrice: number }>();
  private meta: CartMeta = {};
  private metaSent = false;
  private cartClosed = false;
  private sendingPromise: Promise<boolean> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private onOnline = () => {
    this.flush().catch(() => undefined);
  };
  private onPageHide = () => {
    this.handlePageHide();
  };

  constructor(options: CartJournalClientOptions) {
    this.storage = options.storage;
    this.send = options.send;
    this.now = options.now || (() => Date.now());
    this.randomId = options.randomId || defaultRandomId;
    this.flushDelayMs = options.flushDelayMs ?? 1000;
    this.retryMs = options.retryMs ?? 15000;
    this.autoTimers = options.autoTimers ?? true;

    let deviceId = this.read<string>(KEY_DEVICE, '');
    if (!deviceId) {
      deviceId = `dev-${this.randomId()}`;
      this.write(KEY_DEVICE, deviceId);
    }
    this.deviceId = deviceId;
    this.cartId = this.newCartId();
  }

  // ---- التخزين (كل عملية تقرأ من التخزين مباشرة ليعمل أكثر من تبويب معًا) -----

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage.getItem(key);
      return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      /* التخزين ممتلئ أو غير متاح: لا نعطّل شاشة البيع */
    }
  }

  private remove(key: string) {
    try {
      this.storage.removeItem(key);
    } catch {
      /* تجاهل */
    }
  }

  private newCartId(): string {
    return `c-${this.randomId()}`;
  }

  private push(event: Omit<JournalEvent, 'seq' | 'at'> & { at?: number }) {
    const seq = (Number(this.read<number>(KEY_SEQ, 0)) || 0) + 1;
    this.write(KEY_SEQ, seq);
    const { at, ...rest } = event;
    const full: JournalEvent = { ...rest, seq, at: new Date(at ?? this.now()).toISOString() };
    const pending = this.read<JournalEvent[]>(KEY_PENDING, []);
    pending.push(full);
    if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
    this.write(KEY_PENDING, pending);
    this.scheduleFlush();
  }

  private saveSnapshot() {
    const key = KEY_CART_PREFIX + this.cartId;
    const index = this.read<string[]>(KEY_CARTS, []);
    const hasItems = Array.from(this.items.values()).some(entry => entry.qty > 0);
    if (!hasItems) {
      this.remove(key);
      if (index.includes(this.cartId)) this.write(KEY_CARTS, index.filter(id => id !== this.cartId));
      return;
    }
    const items: Record<string, number> = {};
    for (const [itemId, entry] of this.items) if (entry.qty > 0) items[itemId] = entry.qty;
    const snapshot: CartSnapshot = { cartId: this.cartId, items, lastAt: this.now(), heartbeat: this.now(), closed: this.cartClosed };
    this.write(key, snapshot);
    if (!index.includes(this.cartId)) this.write(KEY_CARTS, [...index, this.cartId]);
  }

  private dropSnapshot(cartId: string) {
    this.remove(KEY_CART_PREFIX + cartId);
    const index = this.read<string[]>(KEY_CARTS, []);
    if (index.includes(cartId)) this.write(KEY_CARTS, index.filter(id => id !== cartId));
  }

  private rotateCart() {
    this.dropSnapshot(this.cartId);
    this.cartId = this.newCartId();
    this.items = new Map();
    this.metaSent = false;
    this.cartClosed = false;
  }

  // ---- واجهة شاشة البيع ------------------------------------------------------

  getDeviceId(): string {
    return this.deviceId;
  }

  /** رقم الفاتورة المفتوحة الحالية — يُرسل مع طلب حفظ الفاتورة في الحقل cartId */
  currentCartId(): string {
    return this.cartId;
  }

  pendingCount(): number {
    return this.read<JournalEvent[]>(KEY_PENDING, []).length;
  }

  /** تُستدعى عند كل تغيير في أصناف الفاتورة المفتوحة. تقارن بالحالة السابقة وتسجل الفرق فقط */
  syncCart(lines: CartLineInput[], meta: CartMeta = {}) {
    const next = new Map<string, { qty: number; name: string; barcode: string; unitPrice: number }>();
    for (const line of Array.isArray(lines) ? lines : []) {
      const itemId = String(line?.itemId ?? '').trim();
      const quantity = Number(line?.quantity);
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) continue;
      const existing = next.get(itemId);
      next.set(itemId, {
        qty: round3((existing?.qty || 0) + quantity),
        name: String(line.name ?? existing?.name ?? ''),
        barcode: String(line.barcode ?? existing?.barcode ?? ''),
        unitPrice: Number.isFinite(Number(line.unitPrice)) ? Number(line.unitPrice) : existing?.unitPrice || 0
      });
    }
    this.meta = { ...this.meta, ...meta };

    const activeBefore = Array.from(this.items.entries()).filter(([, entry]) => entry.qty > 0);
    const metaPart = () => {
      if (this.metaSent) return {};
      this.metaSent = true;
      return { warehouseId: this.meta.warehouseId, warehouseName: this.meta.warehouseName, platform: this.meta.platform };
    };

    let changed = false;
    if (next.size === 0 && activeBefore.length >= 2) {
      this.push({ cartId: this.cartId, type: 'clear', ...metaPart() });
      for (const [, entry] of activeBefore) entry.qty = 0;
      changed = true;
    } else {
      const ids = new Set<string>([...this.items.keys(), ...next.keys()]);
      for (const itemId of ids) {
        const before = this.items.get(itemId);
        const after = next.get(itemId);
        const beforeQty = before?.qty || 0;
        const afterQty = after?.qty || 0;
        if (beforeQty === afterQty) continue;
        const info = after || before!;
        this.push({
          cartId: this.cartId,
          type: 'qty',
          itemId,
          itemName: info.name,
          barcode: info.barcode,
          unitPrice: info.unitPrice,
          qty: afterQty,
          ...metaPart()
        });
        this.items.set(itemId, { ...info, qty: afterQty });
        changed = true;
      }
    }
    if (changed) {
      this.cartClosed = false;
      this.saveSnapshot();
    }
  }

  /** بعد نجاح حفظ الفاتورة: تبدأ فاتورة جديدة برقم جديد بدون تسجيل أي حذف */
  cartSaved(): string {
    const saved = this.cartId;
    this.rotateCart();
    return saved;
  }

  /** إغلاق الفاتورة المفتوحة بدون بيع (تسجيل خروج مثلًا) */
  closeCart(reason: 'logout' | 'page_close' | 'other' = 'other') {
    const hasItems = Array.from(this.items.values()).some(entry => entry.qty > 0);
    if (hasItems && !this.cartClosed) this.push({ cartId: this.cartId, type: 'close', reason });
    this.rotateCart();
    this.flush().catch(() => undefined);
  }

  /** عند إغلاق أو تحديث الصفحة: يسجل الحدث على الجهاز ويحاول إرساله قبل أن تُغلق الصفحة */
  handlePageHide() {
    const hasItems = Array.from(this.items.values()).some(entry => entry.qty > 0);
    if (hasItems && !this.cartClosed) {
      this.push({ cartId: this.cartId, type: 'close', reason: 'page_close' });
      this.cartClosed = true;
      this.saveSnapshot();
    }
    this.flush({ keepalive: true }).catch(() => undefined);
  }

  // ---- الرفع للسيرفر ------------------------------------------------------------

  private scheduleFlush() {
    if (!this.autoTimers || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => undefined);
    }, this.flushDelayMs);
  }

  /** يرفع الأحداث المعلقة. يرجع true لو لم يبقَ شيء معلق */
  async flush(options: { keepalive?: boolean } = {}): Promise<boolean> {
    // لو فيه رفع جارٍ ننتظره ثم نرفع ما تبقى
    while (this.sendingPromise) {
      try {
        await this.sendingPromise;
      } catch {
        /* فشل الرفع السابق: نحاول من جديد */
      }
    }
    const run = this.runFlush(options);
    this.sendingPromise = run;
    try {
      return await run;
    } finally {
      if (this.sendingPromise === run) this.sendingPromise = null;
    }
  }

  private async runFlush(options: { keepalive?: boolean }): Promise<boolean> {
    for (;;) {
      const pending = this.read<JournalEvent[]>(KEY_PENDING, []);
      if (pending.length === 0) return true;
      const batch = pending.slice(0, BATCH_SIZE);
      const result = await this.send({ deviceId: this.deviceId, events: batch }, { keepalive: Boolean(options.keepalive) });
      const lastSeq = Number(result?.lastSeq);
      if (!Number.isFinite(lastSeq)) throw new Error('رد غير صالح من السيرفر');
      // السيرفر لم يقبل أي حدث من الدفعة (بيانات غير صالحة): نسقطها حتى لا تحبس ما بعدها
      const confirmedUpTo = lastSeq < batch[0].seq ? batch[batch.length - 1].seq : lastSeq;
      const remaining = this.read<JournalEvent[]>(KEY_PENDING, []).filter(event => event.seq > confirmedUpTo);
      this.write(KEY_PENDING, remaining);
      // لو عدّاد الجهاز أقل من عدّاد السيرفر (تخزين ناقص) نكمل العدّ من رقم السيرفر
      if (lastSeq > (Number(this.read<number>(KEY_SEQ, 0)) || 0)) this.write(KEY_SEQ, lastSeq);
    }
  }

  // ---- التشغيل -------------------------------------------------------------------

  /** فواتير تُركت مفتوحة من جلسة سابقة انتهت فجأة (الجهاز قفل أو المتصفح أُغلق بالقوة) */
  recoverOrphans() {
    const index = this.read<string[]>(KEY_CARTS, []);
    const keep: string[] = [];
    for (const cartId of index) {
      if (cartId === this.cartId) {
        keep.push(cartId);
        continue;
      }
      const snapshot = this.read<CartSnapshot | null>(KEY_CART_PREFIX + cartId, null);
      if (!snapshot) continue;
      if (this.now() - (snapshot.heartbeat || 0) < ORPHAN_AFTER_MS) {
        keep.push(cartId); // تبويب آخر ما زال يعمل على هذه الفاتورة
        continue;
      }
      if (!snapshot.closed && Object.keys(snapshot.items || {}).length > 0) {
        this.push({ cartId, type: 'close', reason: 'crash', at: snapshot.lastAt || this.now() });
      }
      this.remove(KEY_CART_PREFIX + cartId);
    }
    this.write(KEY_CARTS, keep);
  }

  start() {
    this.recoverOrphans();
    if (!this.autoTimers) return;
    const target: any = typeof window !== 'undefined' ? window : null;
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener('online', this.onOnline);
      target.addEventListener('pagehide', this.onPageHide);
    }
    this.heartbeatTimer = setInterval(() => {
      const hasItems = Array.from(this.items.values()).some(entry => entry.qty > 0);
      if (!hasItems) return;
      const key = KEY_CART_PREFIX + this.cartId;
      const snapshot = this.read<CartSnapshot | null>(key, null);
      if (snapshot) this.write(key, { ...snapshot, heartbeat: this.now() });
    }, HEARTBEAT_MS);
    this.retryTimer = setInterval(() => {
      if (this.pendingCount() > 0) this.flush().catch(() => undefined);
    }, this.retryMs);
    this.flush().catch(() => undefined);
  }

  stop() {
    const target: any = typeof window !== 'undefined' ? window : null;
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('online', this.onOnline);
      target.removeEventListener('pagehide', this.onPageHide);
    }
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.flushTimer = null;
    this.heartbeatTimer = null;
    this.retryTimer = null;
  }
}
