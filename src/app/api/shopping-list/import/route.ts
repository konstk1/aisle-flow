import { requireSessionUserId } from "@/auth/access";
import {
  activeShoppingListImportRequestSchema,
  importActiveShoppingListItems,
} from "@/services/active-shopping-list";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../../_lib/responses";
import { activeShoppingListErrorResponse } from "../_lib/responses";

export async function POST(request: Request) {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Send a JSON shopping-list import." },
      { status: 400 },
    );
  }

  const parsed = activeShoppingListImportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted import field.",
    );
  }

  try {
    return Response.json({
      activeList: await importActiveShoppingListItems(userId, parsed.data),
    });
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}
