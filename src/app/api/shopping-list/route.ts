import { requireSessionUserId } from "@/auth/access";
import { getActiveShoppingList } from "@/services/active-shopping-list";

import { unauthorizedResponse } from "../_lib/responses";
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
