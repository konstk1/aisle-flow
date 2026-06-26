import { z } from "zod";

import { hasValidSession } from "@/auth/access";
import {
  activeShoppingItemUpdateRequestSchema,
  deleteActiveShoppingItem,
  setActiveShoppingItemChecked,
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
    if (parsed.data.text !== undefined) {
      return Response.json({
        activeList: await updateActiveShoppingItemText({
          itemId: parsedItemId.data,
          text: parsed.data.text,
        }),
      });
    }

    if (parsed.data.isChecked === undefined) {
      throw new Error("Shopping item update was validated without a field.");
    }

    return Response.json({
      activeList: await setActiveShoppingItemChecked({
        itemId: parsedItemId.data,
        isChecked: parsed.data.isChecked,
      }),
    });
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
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
    return Response.json({
      activeList: await deleteActiveShoppingItem({
        itemId: parsedItemId.data,
      }),
    });
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}
