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

export function moveSectionToTarget(
  aisles: StoreLayoutAisle[],
  sectionId: string,
  targetSectionId: string,
  placement: "before" | "after" = "before",
) {
  if (sectionId === targetSectionId) {
    return aisles;
  }

  const sourceAisle = aisles.find((aisle) =>
    aisle.sections.some((section) => section.id === sectionId),
  );
  const targetAisle = aisles.find((aisle) =>
    aisle.sections.some((section) => section.id === targetSectionId),
  );

  if (
    !sourceAisle ||
    !targetAisle ||
    (sourceAisle.id !== targetAisle.id && sourceAisle.sections.length === 1)
  ) {
    return aisles;
  }

  const section = sourceAisle.sections.find(({ id }) => id === sectionId)!;
  const sourceIndex = sourceAisle.sections.findIndex(
    ({ id }) => id === sectionId,
  );
  const targetIndex = targetAisle.sections.findIndex(
    ({ id }) => id === targetSectionId,
  );

  const movedAisles = aisles.map((aisle) => {
    if (sourceAisle.id === targetAisle.id && aisle.id === sourceAisle.id) {
      const sections = [...aisle.sections];
      sections.splice(sourceIndex, 1);
      sections.splice(targetIndex, 0, section);
      return { ...aisle, sections };
    }

    if (aisle.id === sourceAisle.id) {
      return {
        ...aisle,
        sections: aisle.sections.filter(({ id }) => id !== sectionId),
      };
    }

    if (aisle.id === targetAisle.id) {
      const sections = [...aisle.sections];
      sections.splice(
        targetIndex + (placement === "after" ? 1 : 0),
        0,
        section,
      );
      return { ...aisle, sections };
    }

    return aisle;
  });

  return renumberPathOrders(movedAisles);
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
