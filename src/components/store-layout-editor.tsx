"use client";

import { Plus, Route, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  getRouteSections,
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

function nextOrder(values: number[]) {
  return values.length === 0 ? 0 : Math.max(...values) + 1;
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
  const routeSections = useMemo(() => getRouteSections(layout), [layout]);

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
      const pathOrder = nextOrder(
        current.aisles.flatMap((aisle) =>
          aisle.sections.map((section) => section.pathOrder),
        ),
      );
      const identifier = String(current.aisles.length + 1);
      const aisleId = createId();

      return {
        ...current,
        aisles: [
          ...current.aisles,
          {
            id: aisleId,
            identifier,
            displayName: null,
            sections: [
              {
                id: createId(),
                label: "",
                pathOrder,
                side: "center",
              },
            ],
          },
        ],
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
        aisles: current.aisles.filter((aisle) => aisle.id !== aisleId),
      };
    });
  }

  function addSection(aisleId: string) {
    setLayout((current) => ({
      ...current,
      aisles: current.aisles.map((aisle) => {
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
              pathOrder: nextOrder(
                current.aisles.flatMap((currentAisle) =>
                  currentAisle.sections.map((section) => section.pathOrder),
                ),
              ),
              side: "center",
            },
          ],
        };
      }),
    }));
  }

  function removeSection(aisleId: string, sectionId: string) {
    setLayout((current) => ({
      ...current,
      aisles: current.aisles.map((aisle) => {
        if (aisle.id !== aisleId || aisle.sections.length === 1) {
          return aisle;
        }

        return {
          ...aisle,
          sections: aisle.sections.filter(
            (section) => section.id !== sectionId,
          ),
        };
      }),
    }));
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

  const orderedAisles = layout.aisles;

  return (
    <section className="pt-10 pb-12 sm:pt-14">
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
        Add any aisles and give every section a unique absolute path order.
        Section side is informational only and never changes shopping-list
        sorting.
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

      <div className="mt-10 space-y-8">
        {orderedAisles.map((aisle, aisleIndex) => (
          <article className="border-y py-6" key={aisle.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(7rem,0.35fr)_minmax(0,1fr)]">
                  <label className="text-sm font-medium text-zinc-800">
                    Aisle
                    <input
                      className="mt-2 min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950"
                      onChange={(event) =>
                        updateAisle(aisle.id, {
                          identifier: event.target.value,
                        })
                      }
                      value={aisle.identifier}
                    />
                    <FieldError
                      message={errorFor(`aisles.${aisleIndex}.identifier`)}
                    />
                  </label>
                  <label className="text-sm font-medium text-zinc-800">
                    Display name{" "}
                    <span className="font-normal text-zinc-500">
                      (optional)
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950"
                      onChange={(event) =>
                        updateAisle(aisle.id, {
                          displayName: event.target.value || null,
                        })
                      }
                      value={aisle.displayName ?? ""}
                    />
                  </label>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  disabled={orderedAisles.length === 1}
                  label="Delete aisle"
                  onClick={() => removeAisle(aisle.id)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </IconButton>
              </div>
            </div>

            <div className="mt-7 border-t pt-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-medium text-zinc-950">Sections</h2>
                <button
                  className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-zinc-700 underline-offset-4 hover:underline"
                  onClick={() => addSection(aisle.id)}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add section
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {aisle.sections.map((section, sectionIndex) => (
                  <div
                    className="border-l-2 border-zinc-200 pl-4"
                    key={section.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-zinc-800">
                          Label{" "}
                          <span className="font-normal text-zinc-500">
                            (optional)
                          </span>
                          <input
                            className="mt-2 min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950"
                            onChange={(event) =>
                              updateSection(aisle.id, section.id, {
                                label: event.target.value || null,
                              })
                            }
                            value={section.label ?? ""}
                          />
                        </label>
                        <label className="text-sm font-medium text-zinc-800">
                          Side
                          <select
                            className="mt-2 min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950"
                            onChange={(event) =>
                              updateSection(aisle.id, section.id, {
                                side: event.target
                                  .value as StoreLayoutSection["side"],
                              })
                            }
                            value={section.side}
                          >
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                            <option value="center">Center</option>
                            <option value="endcap">Endcap</option>
                          </select>
                        </label>
                        <label className="text-sm font-medium text-zinc-800">
                          Absolute path order
                          <input
                            className="mt-2 min-h-11 w-full border bg-white px-3 text-base transition outline-none focus:border-zinc-950"
                            min="0"
                            onChange={(event) =>
                              updateSection(aisle.id, section.id, {
                                pathOrder: Number(event.target.value),
                              })
                            }
                            type="number"
                            value={section.pathOrder}
                          />
                          <FieldError
                            message={errorFor(
                              `aisles.${aisleIndex}.sections.${sectionIndex}.pathOrder`,
                            )}
                          />
                        </label>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 pt-7">
                        <IconButton
                          disabled={aisle.sections.length === 1}
                          label="Delete section"
                          onClick={() => removeSection(aisle.id, section.id)}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
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
        <div className="flex items-center gap-3">
          <Route aria-hidden="true" className="size-5" />
          <h2 className="font-medium text-zinc-950" id="route-preview-heading">
            Route preview
          </h2>
        </div>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-zinc-700">
          {routeSections.map(({ aisle, section }, index) => (
            <li className="flex gap-3" key={section.id}>
              <span className="font-medium text-zinc-500 tabular-nums">
                {index + 1}
              </span>
              <span>
                Aisle {aisle.identifier}
                {aisle.displayName ? ` — ${aisle.displayName}` : ""}
                {" · "}
                {section.label || `Section ${section.pathOrder + 1}`}
                {" · "}
                <span className="text-zinc-500">{section.side}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {message ? (
        <p className="mt-5 text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}
    </section>
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
  disabled = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-10 items-center justify-center border text-zinc-700 hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
