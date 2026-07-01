import { requireSessionUserId } from "@/auth/access";
import type { ActiveShoppingListPayload } from "@/domain/active-shopping-list";
import { ActiveShoppingListRequestError } from "@/services/active-shopping-list";

import { unauthorizedResponse } from "../../_lib/responses";

export function activeShoppingListErrorResponse(error: unknown) {
  if (error instanceof ActiveShoppingListRequestError) {
    return Response.json(
      { error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }

  return Response.json(
    { error: "The active shopping list could not be loaded. Try again." },
    { status: 500 },
  );
}

export function createShoppingListGetRoute(
  responseKey: string,
  loadList: (userId: string) => Promise<ActiveShoppingListPayload | null>,
) {
  return async function GET() {
    const userId = await requireSessionUserId();

    if (!userId) {
      return unauthorizedResponse();
    }

    try {
      return Response.json({ [responseKey]: await loadList(userId) });
    } catch (error) {
      return activeShoppingListErrorResponse(error);
    }
  };
}
