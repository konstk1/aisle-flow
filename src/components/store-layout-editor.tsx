"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { aisleAccentColor } from "@/components/aisle-accents";
import {
  formatAisleLabel,
  formatSectionLabel,
  getRouteSections,
  getNextAisleIdentifier,
  orderAisles,
  renumberPathOrders,
  type StoreLayout,
  type StoreLayoutAisle,
  type StoreLayoutSection,
} from "@/domain/store-layout";

type StoreLayoutEditorProps = {
  initialLayout: StoreLayout;
};

type FieldErrors = Record<string, string[]>;

function createId() {
  return crypto.randomUUID();
}

export function StoreLayoutEditor({ initialLayout }: StoreLayoutEditorProps) {
  const [layout, setLayout] = useState<StoreLayout>(initialLayout);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(
    initialLayout.aisles.length > 0
      ? null
      : "Create your first aisle, then save the route.",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [collapsedAisleIds, setCollapsedAisleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [routePreviewExpanded, setRoutePreviewExpanded] = useState(false);
  const routeSections = useMemo(() => getRouteSections(layout), [layout]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function errorFor(path: string) {
    return fieldErrors[path]?.[0];
  }

  function updateAisle(
    aisleId: string,
    patch: Partial<Omit<StoreLayoutAisle, "id" | "sections">>,
  ) {
    setLayout((current) => ({
      ...current,
      aisles: current.aisles.map((aisle) =>
        aisle.id === aisleId ? { ...aisle, ...patch } : aisle,
      ),
    }));
  }

  function updateSection(
    aisleId: string,
    sectionId: string,
    patch: Partial<Omit<StoreLayoutSection, "id">>,
  ) {
    setLayout((current) => ({
      ...current,
      aisles: current.aisles.map((aisle) =>
        aisle.id === aisleId
          ? {
              ...aisle,
              sections: aisle.sections.map((section) =>
                section.id === sectionId ? { ...section, ...patch } : section,
              ),
            }
          : aisle,
      ),
    }));
  }

  function addAisle() {
    setLayout((current) => {
      const identifier = getNextAisleIdentifier(current.aisles);
      const aisleId = createId();

      return {
        ...current,
        aisles: renumberPathOrders([
          ...current.aisles,
          {
            id: aisleId,
            identifier,
            displayName: null,
            displayOrder:
              Math.max(
                -1,
                ...current.aisles.map((aisle) => aisle.displayOrder),
              ) + 1,
            sections: [
              {
                id: createId(),
                label: "",
                pathOrder: 0,
                side: "center",
              },
            ],
          },
        ]),
      };
    });
  }

  function removeAisle(aisleId: string) {
    setLayout((current) => {
      if (current.aisles.length === 1) {
        return current;
      }

      return {
        ...current,
        aisles: renumberPathOrders(
          orderAisles(
            current.aisles.filter((aisle) => aisle.id !== aisleId),
          ).map((aisle, displayOrder) => ({ ...aisle, displayOrder })),
        ),
      };
    });
  }

  function moveAisle(aisleId: string, direction: -1 | 1) {
    setLayout((current) => {
      const aisles = orderAisles(current.aisles);
      const index = aisles.findIndex((aisle) => aisle.id === aisleId);
      const targetIndex = index + direction;

      if (index === -1 || targetIndex < 0 || targetIndex >= aisles.length) {
        return current;
      }

      [aisles[index], aisles[targetIndex]] = [
        aisles[targetIndex],
        aisles[index],
      ];

      return {
        ...current,
        aisles: renumberPathOrders(
          aisles.map((aisle, displayOrder) => ({ ...aisle, displayOrder })),
        ),
      };
    });
  }

  function toggleAisle(aisleId: string) {
    setCollapsedAisleIds((current) => {
      const next = new Set(current);

      if (next.has(aisleId)) {
        next.delete(aisleId);
      } else {
        next.add(aisleId);
      }

      return next;
    });
  }

  function addSection(aisleId: string) {
    setLayout((current) => {
      const aisles = current.aisles.map((aisle) => {
        if (aisle.id !== aisleId) {
          return aisle;
        }

        return {
          ...aisle,
          sections: [
            ...aisle.sections,
            {
              id: createId(),
              label: "",
              pathOrder: 0,
              side: "center" as const,
            },
          ],
        };
      });

      return { ...current, aisles: renumberPathOrders(aisles) };
    });
  }

  function removeSection(aisleId: string, sectionId: string) {
    setLayout((current) => {
      const aisles = current.aisles.map((aisle) => {
        if (aisle.id !== aisleId || aisle.sections.length === 1) {
          return aisle;
        }

        return {
          ...aisle,
          sections: aisle.sections.filter(
            (section) => section.id !== sectionId,
          ),
        };
      });

      return { ...current, aisles: renumberPathOrders(aisles) };
    });
  }

  function moveSection(
    aisleId: string,
    sectionId: string,
    targetSectionId: string,
  ) {
    setLayout((current) => {
      const aisles = current.aisles.map((aisle) => {
        if (aisle.id !== aisleId || sectionId === targetSectionId) {
          return aisle;
        }

        const sourceIndex = aisle.sections.findIndex(
          (section) => section.id === sectionId,
        );
        const targetIndex = aisle.sections.findIndex(
          (section) => section.id === targetSectionId,
        );

        if (sourceIndex === -1 || targetIndex === -1) {
          return aisle;
        }

        const sections = [...aisle.sections];
        const [section] = sections.splice(sourceIndex, 1);
        sections.splice(targetIndex, 0, section);

        return { ...aisle, sections };
      });

      return { ...current, aisles: renumberPathOrders(aisles) };
    });
  }

  async function saveLayout() {
    setIsSaving(true);
    setMessage(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/store-layout", {
        body: JSON.stringify(layout),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      const result = (await response.json()) as {
        error?: string;
        fieldErrors?: FieldErrors;
        layout?: StoreLayout;
      };

      if (!response.ok || !result.layout) {
        setFieldErrors(result.fieldErrors ?? {});
        const invalidAisleIds = new Set(
          Object.keys(result.fieldErrors ?? {})
            .map((path) => path.match(/^aisles\.(\d+)\./)?.[1])
            .flatMap((index) =>
              index === undefined ? [] : [layout.aisles[Number(index)]?.id],
            )
            .filter((id): id is string => Boolean(id)),
        );
        if (invalidAisleIds.size > 0) {
          setCollapsedAisleIds(
            (current) =>
              new Set([...current].filter((id) => !invalidAisleIds.has(id))),
          );
        }
        setMessage(result.error ?? "The layout could not be saved.");
        return;
      }

      setLayout(result.layout);
      setMessage("Route saved.");
    } catch {
      setMessage(
        "The route could not be saved. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const orderedAisles = orderAisles(layout.aisles);

  return (
    <section className="pt-1 pb-12">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold tracking-[0.05em] text-[#8a8a92] uppercase">
            Store route
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Build your route
          </h1>
        </div>
        <button
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[14px] bg-gradient-to-br from-[#0a84ff] to-[#3b9dff] px-5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(10,132,255,0.32)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={saveLayout}
          type="button"
        >
          <Save aria-hidden="true" className="size-4" />
          {isSaving ? "Saving" : "Save route"}
        </button>
      </div>

      <p className="mt-3 max-w-xl text-sm leading-6 text-[#9a9aa2]">
        Add any aisles, then arrange their sections. The path numbers are
        assigned automatically; section side is informational only.
      </p>
      <p className="mt-2 text-sm text-[#9a9aa2]">
        Editing{" "}
        <span className="font-semibold text-[#3a3a44]">{layout.name}</span> —
        rename this store on the{" "}
        <Link
          className="font-semibold text-[#0a84ff] underline-offset-4 hover:underline"
          href="/stores"
        >
          Manage stores
        </Link>{" "}
        page.
      </p>

      <div className="mt-7 space-y-4">
        {orderedAisles.map((aisle, aisleIndex) => {
          const isCollapsed = collapsedAisleIds.has(aisle.id);
          const accentColor = aisleAccentColor(aisle.id);

          return (
            <article
              className="overflow-hidden rounded-[20px] bg-white shadow-[0_2px_20px_rgba(20,23,40,0.06)]"
              key={aisle.id}
            >
              <div className="flex min-h-14 items-center gap-1.5 py-2 pr-3 pl-2 sm:gap-2 sm:pr-4">
                <button
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? "Expand aisle" : "Collapse aisle"}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[#c2c2ca] transition hover:text-[#0a84ff]"
                  onClick={() => toggleAisle(aisle.id)}
                  type="button"
                >
                  {isCollapsed ? (
                    <ChevronRight aria-hidden="true" className="size-4" />
                  ) : (
                    <ChevronDown aria-hidden="true" className="size-4" />
                  )}
                </button>
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[4px]"
                  style={{ background: accentColor }}
                />
                <label className="flex shrink-0 items-baseline gap-1.5 text-sm font-medium text-[#9a9aa2]">
                  Aisle
                  <input
                    aria-label="Aisle number"
                    className="w-9 rounded-lg border border-transparent bg-transparent px-1 text-center text-base font-bold text-[#1c1c24] tabular-nums outline-none transition focus:border-[#0a84ff] focus:bg-white"
                    onChange={(event) =>
                      updateAisle(aisle.id, { identifier: event.target.value })
                    }
                    value={aisle.identifier}
                  />
                </label>
                <input
                  aria-label="Aisle display name"
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[#3a3a44] outline-none transition focus:border-[#0a84ff] focus:bg-white"
                  onChange={(event) =>
                    updateAisle(aisle.id, {
                      displayName: event.target.value || null,
                    })
                  }
                  placeholder="Name (optional)"
                  value={aisle.displayName ?? ""}
                />
                {isCollapsed ? (
                  <span className="shrink-0 rounded-full bg-[#eceef4] px-2.5 py-0.5 text-xs font-semibold text-[#b8b8bf]">
                    {aisle.sections.length}
                  </span>
                ) : null}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    aria-label="Move aisle earlier"
                    className="inline-flex size-8 items-center justify-center rounded-[10px] bg-[#f4f5f9] text-[#8a8a92] transition hover:text-[#0a84ff] disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={aisleIndex === 0}
                    onClick={() => moveAisle(aisle.id, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" className="size-3.5" />
                  </button>
                  <button
                    aria-label="Move aisle later"
                    className="inline-flex size-8 items-center justify-center rounded-[10px] bg-[#f4f5f9] text-[#8a8a92] transition hover:text-[#0a84ff] disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={aisleIndex === orderedAisles.length - 1}
                    onClick={() => moveAisle(aisle.id, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" className="size-3.5" />
                  </button>
                  <IconButton
                    disabled={orderedAisles.length === 1}
                    label="Delete aisle"
                    onClick={() => removeAisle(aisle.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                </div>
              </div>

              {isCollapsed ? null : (
                <div>
                  <DndContext
                    collisionDetection={closestCenter}
                    id={`store-layout-aisle-${aisle.id}`}
                    onDragCancel={() => setActiveSectionId(null)}
                    onDragEnd={({ active, over }) => {
                      if (over && active.id !== over.id) {
                        moveSection(
                          aisle.id,
                          String(active.id),
                          String(over.id),
                        );
                      }
                      setActiveSectionId(null);
                    }}
                    onDragStart={({ active }) =>
                      setActiveSectionId(String(active.id))
                    }
                    sensors={sensors}
                  >
                    <SortableContext
                      items={aisle.sections.map((section) => section.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div>
                        {aisle.sections.map((section) => (
                          <div
                            className="border-t border-[#f0f1f5]"
                            key={section.id}
                          >
                            <SortableSectionRow
                              disabled={aisle.sections.length === 1}
                              onDelete={() =>
                                removeSection(aisle.id, section.id)
                              }
                              onUpdate={(patch) =>
                                updateSection(aisle.id, section.id, patch)
                              }
                              section={section}
                            />
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                    <button
                      className="flex min-h-12 w-full items-center gap-2 border-t border-[#f0f1f5] px-4 text-sm font-semibold text-[#8a8a92] transition hover:text-[#0a84ff]"
                      onClick={() => addSection(aisle.id)}
                      type="button"
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      Add section
                    </button>
                    <DragOverlay>
                      <SectionDragOverlay
                        section={aisle.sections.find(
                          (section) => section.id === activeSectionId,
                        )}
                      />
                    </DragOverlay>
                  </DndContext>
                  <FieldError
                    message={errorFor(`aisles.${aisleIndex}.identifier`)}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <button
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#3a3a44] shadow-[0_2px_14px_rgba(20,23,40,0.05)] transition hover:text-[#0a84ff]"
        onClick={addAisle}
        type="button"
      >
        <Plus aria-hidden="true" className="size-4 text-[#a0a0a8]" />
        Add aisle
      </button>

      <section
        aria-labelledby="route-preview-heading"
        className="mt-8 overflow-hidden rounded-[20px] bg-white shadow-[0_2px_20px_rgba(20,23,40,0.06)]"
      >
        <button
          aria-controls="route-preview-list"
          aria-expanded={routePreviewExpanded}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left sm:px-5"
          onClick={() => setRoutePreviewExpanded((current) => !current)}
          type="button"
        >
          <Route aria-hidden="true" className="size-[18px] text-[#0a84ff]" />
          <h2
            className="text-base font-bold tracking-tight"
            id="route-preview-heading"
          >
            Route preview
          </h2>
          <span className="rounded-full bg-[#eceef4] px-2.5 py-0.5 text-xs font-semibold text-[#b8b8bf]">
            {routeSections.length}
          </span>
          {routePreviewExpanded ? (
            <ChevronDown
              aria-hidden="true"
              className="ml-auto size-4 text-[#c2c2ca]"
            />
          ) : (
            <ChevronRight
              aria-hidden="true"
              className="ml-auto size-4 text-[#c2c2ca]"
            />
          )}
        </button>
        {routePreviewExpanded ? (
          <ol
            className="border-t border-[#f0f1f5] px-4 py-3 sm:px-5"
            id="route-preview-list"
          >
            {routeSections.map(({ aisle, section }, index) => (
              <li
                className="flex gap-3 py-1.5 text-sm leading-6 text-[#3a3a44]"
                key={section.id}
              >
                <span className="w-5 shrink-0 text-right font-semibold text-[#b8b8bf] tabular-nums">
                  {index + 1}
                </span>
                <span>
                  <span className="font-semibold">
                    {formatAisleLabel(aisle)}
                  </span>
                  <span className="text-[#9a9aa2]">
                    {" · "}
                    {formatSectionLabel(section)}
                    {" · "}
                    {section.side}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {message ? (
        <p className="mt-5 text-sm text-[#6a6a72]" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function SortableSectionRow({
  disabled,
  onDelete,
  onUpdate,
  section,
}: {
  disabled: boolean;
  onDelete: () => void;
  onUpdate: (patch: Partial<Omit<StoreLayoutSection, "id">>) => void;
  section: StoreLayoutSection;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  return (
    <div
      className={`flex min-h-12 items-center gap-1 py-1 pr-3 pl-2 sm:gap-1.5 sm:pr-4 ${isDragging ? "opacity-0" : ""}`}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`Drag ${section.label || "section"}`}
        className="inline-flex size-9 shrink-0 cursor-grab items-center justify-center rounded-[10px] text-[#c2c2ca] transition hover:text-[#0a84ff] active:cursor-grabbing"
        ref={setActivatorNodeRef}
        style={{ touchAction: "none" }}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <span className="w-5 shrink-0 text-right text-sm font-semibold text-[#b8b8bf] tabular-nums">
        {section.pathOrder + 1}.
      </span>
      <input
        aria-label="Section label"
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-base outline-none transition focus:border-[#0a84ff] focus:bg-white"
        onChange={(event) => onUpdate({ label: event.target.value || null })}
        placeholder="Section label"
        value={section.label ?? ""}
      />
      <select
        aria-label="Section side"
        className="h-8 w-20 shrink-0 rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium text-[#8a8a92] outline-none transition focus:border-[#0a84ff] sm:w-24"
        onChange={(event) =>
          onUpdate({ side: event.target.value as StoreLayoutSection["side"] })
        }
        value={section.side}
      >
        <option value="left">Left</option>
        <option value="right">Right</option>
        <option value="center">Center</option>
        <option value="endcap">Endcap</option>
      </select>
      <IconButton
        compact
        disabled={disabled}
        label="Delete section"
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </IconButton>
    </div>
  );
}

function SectionDragOverlay({ section }: { section?: StoreLayoutSection }) {
  if (!section) {
    return null;
  }

  return (
    <div className="flex min-h-12 w-[min(36rem,calc(100vw-2.5rem))] items-center gap-2 rounded-xl border border-black/[0.05] bg-white px-3 py-2 shadow-[0_10px_30px_rgba(20,23,40,0.18)]">
      <GripVertical
        aria-hidden="true"
        className="size-5 shrink-0 text-[#c2c2ca]"
      />
      <span className="w-5 shrink-0 text-right text-sm font-semibold text-[#b8b8bf] tabular-nums">
        {section.pathOrder + 1}.
      </span>
      <span className="min-w-0 flex-1 truncate text-base text-[#3a3a44]">
        {section.label || "Section label"}
      </span>
      <span className="text-sm text-[#9a9aa2]">{section.side}</span>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="block px-4 pb-3 text-sm font-medium text-[#ff453a]">
      {message}
    </span>
  );
}

function IconButton({
  children,
  compact = false,
  disabled = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] bg-[#fdeeee] text-[#ff453a] transition hover:bg-[#fbdede] disabled:cursor-not-allowed disabled:opacity-30 ${compact ? "size-8" : "size-[34px]"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
