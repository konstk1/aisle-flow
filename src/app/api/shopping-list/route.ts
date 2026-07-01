import { requireSessionUserId } from "@/auth/access";
import {
  activeShoppingItemCreateRequestSchema,
  addActiveShoppingListItem,
  getActiveShoppingList,
} from "@/services/active-shopping-list";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../_lib/responses";
import { activeShoppingListErrorResponse } from "./_lib/responses";

export async function GET() {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    return Response.json({ activeList: await getActiveShoppingList(userId) });
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}

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
      { error: "Send a JSON shopping-list item." },
      { status: 400 },
    );
  }

  const parsed = activeShoppingItemCreateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted item fields.",
    );
  }

  try {
    return Response.json({
      activeList: await addActiveShoppingListItem(userId, parsed.data),
    });
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}
