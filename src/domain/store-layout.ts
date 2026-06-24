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
