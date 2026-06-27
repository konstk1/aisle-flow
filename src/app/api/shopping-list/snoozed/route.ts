import { getSnoozedShoppingList } from "@/services/active-shopping-list";

import { createShoppingListGetRoute } from "../_lib/responses";

export const GET = createShoppingListGetRoute(
  "snoozedList",
  getSnoozedShoppingList,
);
