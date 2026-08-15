"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { aisleAccentColor } from "@/components/aisle-accents";
import { CopyStoreDialog } from "@/components/copy-store-dialog";
import {
  formatAisleLabel,
  formatSectionLabel,
  getRouteSections,
  getNextAisleIdentifier,
  moveSectionToTarget,
  orderAisles,
  renumberPathOrders,
  type StoreLayout,
  type StoreLayoutAisle,
  type StoreLayoutSection,
} from "@/domain/store-layout";

type StoreLayoutEditorProps = {
  canManage: boolean;
  initialLayout: StoreLayout;
};

type FieldErrors = Record<string, string[]>;

function createId() {
  return crypto.randomUUID();
}

export function StoreLayoutEditor({
  canManage,
  initialLayout,
}: StoreLayoutEditorProps) {
  const router = useRouter();
  const [layout, setLayout] = useState<StoreLayout>(initialLayout);
  const [savedLayout, setSavedLayout] = useState<StoreLayout>(initialLayout);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(
    !canManage
      ? "This route is read-only because another user created the store."
      : initialLayout.aisles.length > 0
        ? null
        : "Create your first aisle, then save the route.",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [collapsedAisleIds, setCollapsedAisleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [routePreviewExpanded, setRoutePreviewExpanded] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const routeSections = useMemo(() => getRouteSections(layout), [layout]);
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(layout) !== JSON.stringify(savedLayout),
    [layout, savedLayout],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
    sectionId: string,
    targetSectionId: string,
    placement: "before" | "after",
  ) {
    setLayout((current) => ({
      ...current,
      aisles: moveSectionToTarget(
        current.aisles,
        sectionId,
        targetSectionId,
        placement,
      ),
    }));
  }

  function moveSectionByDirection(sectionId: string, direction: -1 | 1) {
    setLayout((current) => {
      const sections = getRouteSections(current);
      const sectionIndex = sections.findIndex(
        ({ section }) => section.id === sectionId,
      );
      const target = sections[sectionIndex + direction];

      if (sectionIndex === -1 || !target) {
        return current;
      }

      return {
        ...current,
        aisles: moveSectionToTarget(
          current.aisles,
          sectionId,
          target.section.id,
          direction === -1 ? "before" : "after",
        ),
      };
    });
  }

  async function saveLayout() {
    if (!canManage) {
      return;
    }

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
      setSavedLayout(result.layout);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-ink-500 text-[13px] font-bold tracking-[0.05em] uppercase">
            Store route
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Build your route
          </h1>
        </div>
        <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto">
          <button
            aria-label="Copy to new store"
            className="text-ink-900 shadow-card-sm hover:text-accent inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] bg-white px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            disabled={isSaving}
            onClick={() => setCopyDialogOpen(true)}
            type="button"
          >
            <Copy aria-hidden="true" className="size-4" />
            <span className="sm:hidden">Copy store</span>
            <span className="hidden sm:inline">Copy to new store</span>
          </button>
          <button
            className="from-accent to-accent-bright shadow-accent-glow disabled:from-ink-200 disabled:to-ink-200 disabled:text-ink-500 inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br px-5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-100 disabled:shadow-none sm:flex-none"
            disabled={isSaving || !canManage}
            onClick={saveLayout}
            title={
              canManage
                ? "Save route"
                : "Only the store creator can save this route"
            }
            type="button"
          >
            <Save aria-hidden="true" className="size-4" />
            {isSaving ? "Saving" : "Save route"}
          </button>
        </div>
      </div>

      <p className="text-ink-400 mt-3 max-w-xl text-sm leading-6">
        Add any aisles, then drag sections or use their arrow buttons to move
        them along the route, including between aisles. The path numbers are
        assigned automatically; section side is informational only.
      </p>
      <p className="text-ink-400 mt-2 text-sm">
        {canManage ? "Editing" : "Viewing"}{" "}
        <span className="text-ink-900 font-semibold">{layout.name}</span> —
        {canManage ? "rename this store on the" : "manage your stores on the"}{" "}
        <Link
          className="text-accent font-semibold underline-offset-4 hover:underline"
          href="/stores"
        >
          Manage stores
        </Link>{" "}
        page.
      </p>

      <DndContext
        collisionDetection={pointerWithin}
        id="store-layout-sections"
        onDragCancel={() => setActiveSectionId(null)}
        onDragEnd={({ active, over }) => {
          if (canManage && over && active.id !== over.id) {
            const activeId = String(active.id);
            const overId = String(over.id);
            const sourceAisle = layout.aisles.find((aisle) =>
              aisle.sections.some((section) => section.id === activeId),
            );
            const targetAisleId = overId.startsWith("aisle:")
              ? overId.slice("aisle:".length)
              : null;
            const targetAisle = layout.aisles.find(
              (aisle) =>
                aisle.id === targetAisleId ||
                aisle.sections.some((section) => section.id === overId),
            );
            const targetSection = targetAisleId
              ? targetAisle?.sections.at(-1)
              : targetAisle?.sections.find((section) => section.id === overId);
            const translatedRect = active.rect.current.translated;
            const placement =
              targetAisleId ||
              (sourceAisle?.id !== targetAisle?.id &&
                translatedRect &&
                translatedRect.top > over.rect.top + over.rect.height / 2)
                ? "after"
                : "before";

            if (targetSection) {
              moveSection(activeId, targetSection.id, placement);
            }
          }
          setActiveSectionId(null);
        }}
        onDragStart={({ active }) => {
          if (canManage) {
            setActiveSectionId(String(active.id));
          }
        }}
        sensors={sensors}
      >
        <div className="mt-7 space-y-4">
          {orderedAisles.map((aisle, aisleIndex) => {
            const isCollapsed = collapsedAisleIds.has(aisle.id);
            const accentColor = aisleAccentColor(aisle.id);

            return (
              <DroppableAisle
                aisleId={aisle.id}
                canManage={canManage}
                isCollapsed={isCollapsed}
                key={aisle.id}
              >
                <article className="card overflow-hidden">
                  <div className="flex min-h-14 items-center gap-1.5 py-2 pr-3 pl-2 sm:gap-2 sm:pr-4">
                    <button
                      aria-expanded={!isCollapsed}
                      aria-label={
                        isCollapsed ? "Expand aisle" : "Collapse aisle"
                      }
                      className="text-ink-200 hover:text-accent inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] transition"
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
                    <label className="text-ink-400 flex shrink-0 items-baseline gap-1.5 text-sm font-medium">
                      Aisle
                      <input
                        aria-label="Aisle number"
                        className="text-foreground focus:border-accent w-9 rounded-lg border border-transparent bg-transparent px-1 text-center text-base font-bold tabular-nums transition outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!canManage}
                        onChange={(event) =>
                          updateAisle(aisle.id, {
                            identifier: event.target.value,
                          })
                        }
                        value={aisle.identifier}
                      />
                    </label>
                    <input
                      aria-label="Aisle display name"
                      className="text-ink-900 focus:border-accent min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium transition outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!canManage}
                      onChange={(event) =>
                        updateAisle(aisle.id, {
                          displayName: event.target.value || null,
                        })
                      }
                      placeholder="Name (optional)"
                      value={aisle.displayName ?? ""}
                    />
                    {isCollapsed ? (
                      <span className="bg-divider text-ink-250 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        {aisle.sections.length}
                      </span>
                    ) : null}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        aria-label="Move aisle earlier"
                        className="bg-ink-50 text-ink-500 hover:text-accent inline-flex size-8 items-center justify-center rounded-[10px] transition disabled:cursor-not-allowed disabled:opacity-30"
                        disabled={!canManage || aisleIndex === 0}
                        onClick={() => moveAisle(aisle.id, -1)}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        aria-label="Move aisle later"
                        className="bg-ink-50 text-ink-500 hover:text-accent inline-flex size-8 items-center justify-center rounded-[10px] transition disabled:cursor-not-allowed disabled:opacity-30"
                        disabled={
                          !canManage || aisleIndex === orderedAisles.length - 1
                        }
                        onClick={() => moveAisle(aisle.id, 1)}
                        type="button"
                      >
                        <ArrowDown aria-hidden="true" className="size-3.5" />
                      </button>
                      <IconButton
                        disabled={!canManage || orderedAisles.length === 1}
                        label="Delete aisle"
                        onClick={() => removeAisle(aisle.id)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </IconButton>
                    </div>
                  </div>

                  {isCollapsed ? null : (
                    <div>
                      <SortableContext
                        items={aisle.sections.map((section) => section.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div>
                          {aisle.sections.map((section) => (
                            <div
                              className="border-divider-soft border-t"
                              key={section.id}
                            >
                              <SortableSectionRow
                                canManage={canManage}
                                canMoveEarlier={
                                  routeSections.findIndex(
                                    ({ section: routeSection }) =>
                                      routeSection.id === section.id,
                                  ) > 0 && aisle.sections.length > 1
                                }
                                canMoveLater={
                                  routeSections.findIndex(
                                    ({ section: routeSection }) =>
                                      routeSection.id === section.id,
                                  ) <
                                    routeSections.length - 1 &&
                                  aisle.sections.length > 1
                                }
                                disabled={
                                  !canManage || aisle.sections.length === 1
                                }
                                onDelete={() =>
                                  removeSection(aisle.id, section.id)
                                }
                                onMoveEarlier={() =>
                                  moveSectionByDirection(section.id, -1)
                                }
                                onMoveLater={() =>
                                  moveSectionByDirection(section.id, 1)
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
                        className="border-divider-soft text-ink-500 hover:text-accent flex min-h-12 w-full items-center gap-2 border-t px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!canManage}
                        onClick={() => addSection(aisle.id)}
                        type="button"
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        Add section
                      </button>
                      <FieldError
                        message={errorFor(`aisles.${aisleIndex}.identifier`)}
                      />
                    </div>
                  )}
                </article>
              </DroppableAisle>
            );
          })}
        </div>
        <DragOverlay>
          <SectionDragOverlay
            section={layout.aisles
              .flatMap((aisle) => aisle.sections)
              .find((section) => section.id === activeSectionId)}
          />
        </DragOverlay>
      </DndContext>

      <button
        className="text-ink-900 shadow-card-sm hover:text-accent mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canManage}
        onClick={addAisle}
        type="button"
      >
        <Plus aria-hidden="true" className="text-ink-350 size-4" />
        Add aisle
      </button>

      <section
        aria-labelledby="route-preview-heading"
        className="card mt-8 overflow-hidden"
      >
        <button
          aria-controls="route-preview-list"
          aria-expanded={routePreviewExpanded}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left sm:px-5"
          onClick={() => setRoutePreviewExpanded((current) => !current)}
          type="button"
        >
          <Route aria-hidden="true" className="text-accent size-[18px]" />
          <h2
            className="text-base font-bold tracking-tight"
            id="route-preview-heading"
          >
            Route preview
          </h2>
          <span className="bg-divider text-ink-250 rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {routeSections.length}
          </span>
          {routePreviewExpanded ? (
            <ChevronDown
              aria-hidden="true"
              className="text-ink-200 ml-auto size-4"
            />
          ) : (
            <ChevronRight
              aria-hidden="true"
              className="text-ink-200 ml-auto size-4"
            />
          )}
        </button>
        {routePreviewExpanded ? (
          <ol
            className="border-divider-soft border-t px-4 py-3 sm:px-5"
            id="route-preview-list"
          >
            {routeSections.map(({ aisle, section }, index) => (
              <li
                className="text-ink-900 flex gap-3 py-1.5 text-sm leading-6"
                key={section.id}
              >
                <span className="text-ink-250 w-5 shrink-0 text-right font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span>
                  <span className="font-semibold">
                    {formatAisleLabel(aisle)}
                  </span>
                  <span className="text-ink-400">
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
        <p className="text-ink-600 mt-5 text-sm" role="status">
          {message}
        </p>
      ) : null}
      {copyDialogOpen ? (
        <CopyStoreDialog
          hasUnsavedChanges={hasUnsavedChanges}
          onCancel={() => setCopyDialogOpen(false)}
          onCopied={() => {
            setCopyDialogOpen(false);
            router.refresh();
          }}
          sourceStoreId={layout.id}
          sourceStoreName={layout.name}
        />
      ) : null}
    </section>
  );
}

function DroppableAisle({
  aisleId,
  canManage,
  children,
  isCollapsed,
}: {
  aisleId: string;
  canManage: boolean;
  children: React.ReactNode;
  isCollapsed: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: !canManage || !isCollapsed,
    id: `aisle:${aisleId}`,
  });

  return (
    <div
      className={isOver ? "ring-accent rounded-[20px] ring-2" : undefined}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}

function SortableSectionRow({
  canManage,
  canMoveEarlier,
  canMoveLater,
  disabled,
  onDelete,
  onMoveEarlier,
  onMoveLater,
  onUpdate,
  section,
}: {
  canManage: boolean;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  disabled: boolean;
  onDelete: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onUpdate: (patch: Partial<Omit<StoreLayoutSection, "id">>) => void;
  section: StoreLayoutSection;
}) {
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    disabled: {
      draggable: !canManage || disabled,
      droppable: !canManage,
    },
    id: section.id,
  });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  return (
    <div
      className={`flex min-h-12 flex-wrap items-center gap-1 py-1 pr-3 pl-2 sm:flex-nowrap sm:gap-1.5 sm:pr-4 ${isDragging ? "opacity-0" : ""} ${isOver ? "bg-accent/5" : ""}`}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`Drag ${section.label || "section"}`}
        className="text-ink-200 hover:text-accent inline-flex size-9 shrink-0 cursor-grab items-center justify-center rounded-[10px] transition active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canManage || disabled}
        ref={setActivatorNodeRef}
        style={{ touchAction: "none" }}
        type="button"
        {...attributes}
        {...listeners}
        tabIndex={-1}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <span className="text-ink-250 w-5 shrink-0 text-right text-sm font-semibold tabular-nums">
        {section.pathOrder + 1}.
      </span>
      <input
        aria-label="Section label"
        className="focus:border-accent min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-base transition outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canManage}
        onChange={(event) => onUpdate({ label: event.target.value || null })}
        placeholder="Section label"
        value={section.label ?? ""}
      />
      <select
        aria-label="Section side"
        className="text-ink-500 focus:border-accent h-8 w-20 shrink-0 rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium transition outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-24"
        disabled={!canManage}
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
      <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
        <MoveSectionButton
          disabled={!canManage || !canMoveEarlier}
          label={`Move ${section.label || "section"} earlier`}
          onClick={onMoveEarlier}
        >
          <ArrowUp aria-hidden="true" className="size-3.5" />
        </MoveSectionButton>
        <MoveSectionButton
          disabled={!canManage || !canMoveLater}
          label={`Move ${section.label || "section"} later`}
          onClick={onMoveLater}
        >
          <ArrowDown aria-hidden="true" className="size-3.5" />
        </MoveSectionButton>
        <IconButton
          compact
          disabled={disabled}
          label="Delete section"
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

function MoveSectionButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="bg-ink-50 text-ink-500 hover:text-accent inline-flex size-8 items-center justify-center rounded-[10px] transition disabled:cursor-not-allowed disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
        className="text-ink-200 size-5 shrink-0"
      />
      <span className="text-ink-250 w-5 shrink-0 text-right text-sm font-semibold tabular-nums">
        {section.pathOrder + 1}.
      </span>
      <span className="text-ink-900 min-w-0 flex-1 truncate text-base">
        {section.label || "Section label"}
      </span>
      <span className="text-ink-400 text-sm">{section.side}</span>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="text-danger block px-4 pb-3 text-sm font-medium">
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
      className={`bg-danger-50 text-danger hover:bg-danger-100 inline-flex shrink-0 items-center justify-center rounded-[10px] transition disabled:cursor-not-allowed disabled:opacity-30 ${compact ? "size-8" : "size-[34px]"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
