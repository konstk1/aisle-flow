import { z } from "zod";

import { hasValidSession } from "@/auth/access";
import {
  activeShoppingItemCheckRequestSchema,
  setActiveShoppingItemChecked,
} from "@/services/active-shopping-list";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../../../_lib/responses";
import { activeShoppingListErrorResponse } from "../../_lib/responses";

const itemIdSchema = z.uuid("Choose a valid shopping-list item.");

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
    return Response.json(
      {
        error: "Choose a valid shopping-list item.",
        fieldErrors: { itemId: ["Choose a valid shopping-list item."] },
      },
      { status: 422 },
    );
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

  const parsed = activeShoppingItemCheckRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted item fields.",
    );
  }

  try {
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
