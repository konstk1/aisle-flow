export type AisleSectionSide = "left" | "right" | "center" | "endcap";

export type StoreLayoutSection = {
  id: string;
  label: string | null;
  pathOrder: number;
  side: AisleSectionSide;
};

export type StoreLayoutAisle = {
  id: string;
  identifier: string;
  displayName: string | null;
  displayOrder: number;
  sections: StoreLayoutSection[];
};

export type StoreLayout = {
  id: string;
  name: string;
  aisles: StoreLayoutAisle[];
};

export function getRouteSections(layout: StoreLayout) {
  return layout.aisles
    .flatMap((aisle) => aisle.sections.map((section) => ({ aisle, section })))
    .sort(
      (first, second) => first.section.pathOrder - second.section.pathOrder,
    );
}

export function renumberPathOrders(aisles: StoreLayoutAisle[]) {
  let pathOrder = 0;

  return orderAisles(aisles).map((aisle) => ({
    ...aisle,
    sections: aisle.sections.map((section) => ({
      ...section,
      pathOrder: pathOrder++,
    })),
  }));
}

export function orderAisles(aisles: StoreLayoutAisle[]) {
  return [...aisles].sort(
    (first, second) => first.displayOrder - second.displayOrder,
  );
}

export function formatAisleLabel(
  aisle: Pick<StoreLayoutAisle, "displayName" | "identifier">,
) {
  return aisle.displayName?.trim() || `Aisle ${aisle.identifier}`;
}

export function formatSectionLabel(
  section: Pick<StoreLayoutSection, "label" | "pathOrder">,
) {
  return section.label?.trim() || `Section ${section.pathOrder + 1}`;
}

export function getNextAisleIdentifier(aisles: StoreLayoutAisle[]) {
  const identifiers = new Set(aisles.map((aisle) => aisle.identifier.trim()));
  const highestNumericIdentifier = Math.max(
    0,
    ...aisles.flatMap((aisle) =>
      /^\d+$/.test(aisle.identifier.trim())
        ? [Number(aisle.identifier.trim())]
        : [],
    ),
  );
  let nextIdentifier = highestNumericIdentifier + 1;

  while (identifiers.has(String(nextIdentifier))) {
    nextIdentifier += 1;
  }

  return String(nextIdentifier);
}
