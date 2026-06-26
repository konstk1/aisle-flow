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
  initialLayout: StoreLayout | null;
};

type FieldErrors = Record<string, string[]>;

function createId() {
  return crypto.randomUUID();
}

function createDefaultLayout(): StoreLayout {
  return {
    id: createId(),
    name: "My store",
    aisles: [
      {
        id: createId(),
        identifier: "1",
        displayName: null,
        displayOrder: 0,
        sections: [
          {
            id: createId(),
            label: "Section 1",
            pathOrder: 0,
            side: "center",
          },
        ],
      },
    ],
  };
}

export function StoreLayoutEditor({ initialLayout }: StoreLayoutEditorProps) {
  const [layout, setLayout] = useState<StoreLayout>(
    () => initialLayout ?? createDefaultLayout(),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(
    initialLayout ? null : "Create your first aisle, then save the route.",
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
    <section className="pt-6 pb-12 sm:pt-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">Store layout</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Build your route.
          </h1>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={saveLayout}
          type="button"
        >
          <Save aria-hidden="true" className="size-4" />
          {isSaving ? "Saving" : "Save route"}
        </button>
      </div>

      <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">
        Add any aisles, then arrange their sections. The path numbers are
        assigned automatically; section side is informational only.
      </p>

      <label className="mt-8 block text-sm font-medium text-zinc-800">
        Store name
        <input
          className="mt-2 min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950"
          onChange={(event) =>
            setLayout((current) => ({ ...current, name: event.target.value }))
          }
          value={layout.name}
        />
        <FieldError message={errorFor("name")} />
      </label>

      <div className="mt-10 space-y-5">
        {orderedAisles.map((aisle, aisleIndex) => {
          const isCollapsed = collapsedAisleIds.has(aisle.id);

          return (
            <article key={aisle.id}>
              <div className="flex min-h-11 items-center gap-2">
                <button
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? "Expand aisle" : "Collapse aisle"}
                  className="inline-flex size-8 shrink-0 items-center justify-center text-zinc-500 transition hover:text-zinc-950"
                  onClick={() => toggleAisle(aisle.id)}
                  type="button"
                >
                  {isCollapsed ? (
                    <ChevronRight aria-hidden="true" className="size-4" />
                  ) : (
                    <ChevronDown aria-hidden="true" className="size-4" />
                  )}
                </button>
                <div className="flex shrink-0">
                  <button
                    aria-label="Move aisle earlier"
                    className="inline-flex size-7 items-center justify-center text-zinc-400 transition hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={aisleIndex === 0}
                    onClick={() => moveAisle(aisle.id, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" className="size-3.5" />
                  </button>
                  <button
                    aria-label="Move aisle later"
                    className="inline-flex size-7 items-center justify-center text-zinc-400 transition hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={aisleIndex === orderedAisles.length - 1}
                    onClick={() => moveAisle(aisle.id, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
                <label className="flex shrink-0 items-baseline gap-1 text-sm text-zinc-500">
                  Aisle
                  <input
                    aria-label="Aisle number"
                    className="w-7 bg-transparent px-0 text-base font-semibold text-zinc-950 tabular-nums outline-none focus:ring-1 focus:ring-zinc-400"
                    onChange={(event) =>
                      updateAisle(aisle.id, { identifier: event.target.value })
                    }
                    value={aisle.identifier}
                  />
                </label>
                <input
                  aria-label="Aisle display name"
                  className="w-36 max-w-[40vw] bg-transparent px-1 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-1 focus:ring-zinc-400"
                  onChange={(event) =>
                    updateAisle(aisle.id, {
                      displayName: event.target.value || null,
                    })
                  }
                  placeholder="Name (optional)"
                  value={aisle.displayName ?? ""}
                />
                <div className="ml-auto shrink-0">
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
                <div className="mt-1 ml-8">
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
                      <div className="mt-2 space-y-1">
                        {aisle.sections.map((section) => (
                          <SortableSectionRow
                            disabled={aisle.sections.length === 1}
                            key={section.id}
                            onDelete={() => removeSection(aisle.id, section.id)}
                            onUpdate={(patch) =>
                              updateSection(aisle.id, section.id, patch)
                            }
                            section={section}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <button
                      className="mt-1 flex min-h-10 w-full items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-950"
                      onClick={() => addSection(aisle.id)}
                      type="button"
                    >
                      <span aria-hidden="true" className="size-8 shrink-0" />
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
        className="mt-7 inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium text-zinc-800 hover:border-zinc-950"
        onClick={addAisle}
        type="button"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add aisle
      </button>

      <section
        className="mt-12 border-y py-6"
        aria-labelledby="route-preview-heading"
      >
        <button
          aria-controls="route-preview-list"
          aria-expanded={routePreviewExpanded}
          className="flex min-h-11 w-full items-center gap-3 text-left"
          onClick={() => setRoutePreviewExpanded((current) => !current)}
          type="button"
        >
          <Route aria-hidden="true" className="size-5" />
          <h2 className="font-medium text-zinc-950" id="route-preview-heading">
            Route preview
          </h2>
          {routePreviewExpanded ? (
            <ChevronDown aria-hidden="true" className="ml-auto size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="ml-auto size-4" />
          )}
        </button>
        {routePreviewExpanded ? (
          <ol
            className="mt-4 space-y-3 text-sm leading-6 text-zinc-700"
            id="route-preview-list"
          >
            {routeSections.map(({ aisle, section }, index) => (
              <li className="flex gap-3" key={section.id}>
                <span className="font-medium text-zinc-500 tabular-nums">
                  {index + 1}
                </span>
                <span>
                  {formatAisleLabel(aisle)}
                  {" · "}
                  {formatSectionLabel(section)}
                  {" · "}
                  <span className="text-zinc-500">{section.side}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {message ? (
        <p className="mt-5 text-sm text-zinc-700" role="status">
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
      className={`flex min-h-10 items-center gap-2 py-0.5 ${isDragging ? "opacity-0" : ""}`}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`Drag ${section.label || "section"}`}
        className="inline-flex size-8 shrink-0 cursor-grab items-center justify-center text-zinc-400 active:cursor-grabbing"
        ref={setActivatorNodeRef}
        style={{ touchAction: "none" }}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <span className="w-6 shrink-0 text-right text-sm font-medium text-zinc-500 tabular-nums">
        {section.pathOrder + 1}.
      </span>
      <input
        aria-label="Section label"
        className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-zinc-400"
        onChange={(event) => onUpdate({ label: event.target.value || null })}
        placeholder="Section label"
        value={section.label ?? ""}
      />
      <select
        aria-label="Section side"
        className="min-h-8 w-24 shrink-0 bg-transparent px-1 text-sm text-zinc-700 outline-none"
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
    <div className="flex min-h-12 w-[min(36rem,calc(100vw-2.5rem))] items-center gap-2 border bg-white px-2 py-2 shadow-lg">
      <GripVertical
        aria-hidden="true"
        className="size-5 shrink-0 text-zinc-400"
      />
      <span className="w-6 shrink-0 text-right text-sm font-medium text-zinc-500 tabular-nums">
        {section.pathOrder + 1}.
      </span>
      <span className="min-w-0 flex-1 truncate text-base text-zinc-900">
        {section.label || "Section label"}
      </span>
      <span className="text-sm text-zinc-600">{section.side}</span>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="mt-1 block text-sm font-normal text-red-700">
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
      className={`inline-flex items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-30 ${compact ? "size-8" : "size-10"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
