import { z } from "zod";

import { hasValidSession } from "@/auth/access";
import type { ActiveShoppingListPayload } from "@/domain/active-shopping-list";
import {
  activeShoppingItemUpdateRequestSchema,
  deleteActiveShoppingItem,
  setActiveShoppingItemChecked,
  type ShoppingListView,
  updateActiveShoppingItemText,
} from "@/services/active-shopping-list";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../../../_lib/responses";
import { activeShoppingListErrorResponse } from "../../_lib/responses";

const itemIdSchema = z.uuid("Choose a valid shopping-list item.");
const invalidItemResponseBody = {
  error: "Choose a valid shopping-list item.",
  fieldErrors: { itemId: ["Choose a valid shopping-list item."] },
};

function responseViewFromRequest(request: Request): ShoppingListView {
  const view = new URL(request.url).searchParams.get("view");

  return view === "completed" ? "completed" : "active";
}

function shoppingListResponse(list: ActiveShoppingListPayload) {
  return { list };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  if (!(await hasValidSession())) {
    return unauthorizedResponse();
  }

  const { itemId } = await context.params;
  const parsedItemId = itemIdSchema.safeParse(itemId);

  if (!parsedItemId.success) {
    return Response.json(invalidItemResponseBody, { status: 422 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Send a JSON shopping-list item update." },
      { status: 400 },
    );
  }

  const parsed = activeShoppingItemUpdateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted item fields.",
    );
  }

  try {
    const responseView = responseViewFromRequest(request);

    if (parsed.data.text !== undefined) {
      const list = await updateActiveShoppingItemText({
        itemId: parsedItemId.data,
        responseView,
        text: parsed.data.text,
      });

      return Response.json(shoppingListResponse(list));
    }

    if (parsed.data.isChecked === undefined) {
      throw new Error("Shopping item update was validated without a field.");
    }

    const list = await setActiveShoppingItemChecked({
      isChecked: parsed.data.isChecked,
      itemId: parsedItemId.data,
      responseView,
    });

    return Response.json(shoppingListResponse(list));
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  if (!(await hasValidSession())) {
    return unauthorizedResponse();
  }

  const { itemId } = await context.params;
  const parsedItemId = itemIdSchema.safeParse(itemId);

  if (!parsedItemId.success) {
    return Response.json(invalidItemResponseBody, { status: 422 });
  }

  try {
    const responseView = responseViewFromRequest(request);
    const list = await deleteActiveShoppingItem({
      itemId: parsedItemId.data,
      responseView,
    });

    return Response.json(shoppingListResponse(list));
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}
