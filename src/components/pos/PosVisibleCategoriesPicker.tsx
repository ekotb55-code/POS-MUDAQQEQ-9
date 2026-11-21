import React, { useMemo, useState } from 'react';
import { ProductCategory } from '../../types';
import { FolderTree, Search, CheckSquare, Square, AlertCircle } from 'lucide-react';

interface PosVisibleCategoriesPickerProps {
  categories: ProductCategory[];
  selectedCategoryIds: string[];
  onChange: (nextIds: string[]) => void;
  compact?: boolean;
}

function getParentId(cat?: ProductCategory | null): string | undefined {
  if (!cat) return undefined;
  const pId = cat.parentCategoryId || (cat as any).parentId;
  if (!pId || pId === '' || pId === 'null' || pId === 'undefined') return undefined;
  return String(pId);
}

/**
 * استخراج التصنيفات النشطة والصالحة للظهور في نقطة البيع (نشطة ومفعّلة showInPOS وجميع أسلافها كذلك)
 */
export function filterEligiblePosCategories(categories: ProductCategory[]): ProductCategory[] {
  const catMap = new Map<string, ProductCategory>();
  for (const c of categories) {
    if (c && c.id) catMap.set(c.id, c);
  }

  const isEligible = (cat: ProductCategory, visited = new Set<string>()): boolean => {
    if (visited.has(cat.id)) return false;
    visited.add(cat.id);
    const isActive = cat.status === 'active' || cat.status === 'نشط';
    const isVisibleInPOS = cat.showInPOS !== false;
    if (!isActive || !isVisibleInPOS) return false;
    const pId = getParentId(cat);
    if (pId) {
      const parent = catMap.get(pId);
      if (!parent || !isEligible(parent, visited)) return false;
    }
    return true;
  };

  return categories.filter((c) => c && c.id && isEligible(c));
}

export const PosVisibleCategoriesPicker: React.FC<PosVisibleCategoriesPickerProps> = ({
  categories,
  selectedCategoryIds,
  onChange,
  compact = false
}) => {
  const [search, setSearch] = useState('');

  const eligibleCategories = useMemo(
    () => filterEligiblePosCategories(categories),
    [categories]
  );

  const eligibleIdSet = useMemo(
    () => new Set(eligibleCategories.map((c) => c.id)),
    [eligibleCategories]
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ProductCategory[]>();
    for (const c of eligibleCategories) {
      const pId = getParentId(c);
      if (pId) {
        const list = map.get(pId) || [];
        list.push(c);
        map.set(pId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    }
    return map;
  }, [eligibleCategories]);

  const rootCategories = useMemo(
    () =>
      eligibleCategories
        .filter((c) => !getParentId(c))
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
    [eligibleCategories]
  );

  const selectedSet = useMemo(
    () =>
      new Set(
        (selectedCategoryIds || [])
          .map((id) => String(id || '').trim())
          .filter((id) => id && eligibleIdSet.has(id))
      ),
    [selectedCategoryIds, eligibleIdSet]
  );

  const getDescendantIds = (rootId: string): Set<string> => {
    const result = new Set<string>();
    const stack = [...(childrenByParent.get(rootId) || [])];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (result.has(curr.id)) continue;
      result.add(curr.id);
      const kids = childrenByParent.get(curr.id);
      if (kids && kids.length > 0) {
        stack.push(...kids);
      }
    }
    return result;
  };

  const hasSelectedAncestor = (cat: ProductCategory): boolean => {
    let pId = getParentId(cat);
    const visited = new Set<string>();
    while (pId && !visited.has(pId)) {
      visited.add(pId);
      if (selectedSet.has(pId)) return true;
      const parent = eligibleCategories.find((c) => c.id === pId);
      pId = getParentId(parent);
    }
    return false;
  };

  const handleToggleCategory = (cat: ProductCategory) => {
    const next = new Set(selectedSet);
    if (next.has(cat.id)) {
      next.delete(cat.id);
    } else {
      // عند اختيار تصنيف رئيسي، تُزال المعرفات الفرعية الزائدة تحته لأن اختيار الرئيسي يعرض فروعه عند الفتح
      const descendants = getDescendantIds(cat.id);
      for (const dId of descendants) {
        next.delete(dId);
      }
      next.add(cat.id);
    }
    onChange(Array.from(next));
  };

  const handleSelectAllRoots = () => {
    onChange(rootCategories.map((r) => r.id));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const normalizedQuery = search.trim().toLowerCase();

  const filteredTree = useMemo(() => {
    if (!normalizedQuery) {
      return rootCategories.map((root) => ({
        root,
        subs: childrenByParent.get(root.id) || []
      }));
    }
    const out: Array<{ root: ProductCategory; subs: ProductCategory[] }> = [];
    for (const root of rootCategories) {
      const allSubs = childrenByParent.get(root.id) || [];
      const rootMatches = root.name.toLowerCase().includes(normalizedQuery);
      const matchingSubs = allSubs.filter((s) =>
        s.name.toLowerCase().includes(normalizedQuery)
      );
      if (rootMatches || matchingSubs.length > 0) {
        out.push({
          root,
          subs: rootMatches ? allSubs : matchingSubs
        });
      }
    }
    return out;
  }, [rootCategories, childrenByParent, normalizedQuery]);

  if (eligibleCategories.length === 0) {
    return (
      <div className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)]">
        لا توجد تصنيفات نشطة متاحة للاختيار حالياً. أضف تصنيفات من شاشة التصنيفات أولاً.
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-2.5">
      {/* شريط الملخص والإجراءات السريعة */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold text-[var(--text-primary)]">
          المحدد للعرض:{' '}
          <span className="font-mono text-[#1668B2]">{selectedSet.size}</span>
          <span className="font-normal text-[var(--text-secondary)]">
            {' '}
            (من أصل {rootCategories.length} رئيسي)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSelectAllRoots}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[11px] font-bold text-[var(--text-primary)] cursor-pointer transition"
          >
            <CheckSquare className="w-3.5 h-3.5 text-[#1668B2]" />
            <span>تحديد الرئيسية</span>
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={selectedSet.size === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--surface-subtle)] text-[11px] font-bold text-[var(--text-secondary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition"
          >
            <Square className="w-3.5 h-3.5" />
            <span>مسح الكل</span>
          </button>
        </div>
      </div>

      {selectedSet.size === 0 && (
        <div
          role="status"
          className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[11px] font-semibold text-amber-800 dark:text-amber-200"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            لم يتم تحديد أي تصنيف — ستظهر شاشة نقطة البيع بحالة فارغة تطلب تحديد التصنيفات ولن تعرض كل الأصناف تلقائياً.
          </span>
        </div>
      )}

      {/* بحث عند وجود عدد كبير من التصنيفات */}
      {eligibleCategories.length > 6 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم التصنيف..."
            className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#1668B2]"
          />
        </div>
      )}

      {/* قائمة التصنيفات الهرمية */}
      <div
        className={`rounded-xl border border-[var(--border-color)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)] overflow-y-auto custom-scrollbar ${
          compact ? 'max-h-44' : 'max-h-72'
        }`}
      >
        {filteredTree.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text-secondary)]">
            لا توجد تصنيفات مطابقة للبحث
          </div>
        ) : (
          filteredTree.map(({ root, subs }) => {
            const isRootSelected = selectedSet.has(root.id);
            return (
              <div key={root.id} className="p-2 space-y-1">
                <label className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer select-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isRootSelected}
                      onChange={() => handleToggleCategory(root)}
                      className="w-4 h-4 accent-[#1668B2] cursor-pointer shrink-0"
                    />
                    <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {root.name}
                    </span>
                  </div>
                  {subs.length > 0 && (
                    <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                      {isRootSelected ? `يشمل ${subs.length} فرع` : `${subs.length} فرع`}
                    </span>
                  )}
                </label>

                {subs.length > 0 && (
                  <div className="pr-6 space-y-0.5">
                    {subs.map((sub) => {
                      const coveredByParent = hasSelectedAncestor(sub);
                      const isSubSelected = selectedSet.has(sub.id);
                      return (
                        <label
                          key={sub.id}
                          className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg select-none ${
                            coveredByParent
                              ? 'opacity-65 cursor-default'
                              : 'hover:bg-[var(--surface-subtle)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={coveredByParent || isSubSelected}
                              disabled={coveredByParent}
                              onChange={() => {
                                if (!coveredByParent) handleToggleCategory(sub);
                              }}
                              className="w-3.5 h-3.5 accent-[#1668B2] cursor-pointer disabled:cursor-default shrink-0"
                            />
                            <FolderTree className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
                            <span className="text-xs text-[var(--text-primary)] truncate">
                              {sub.name}
                            </span>
                          </div>
                          {coveredByParent && (
                            <span className="text-[10px] text-[var(--text-secondary)] shrink-0">
                              ضمن الرئيسي
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
