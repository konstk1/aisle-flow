import { ActiveShoppingListRequestError } from "@/services/active-shopping-list";

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
