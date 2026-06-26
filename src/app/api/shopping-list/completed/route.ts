import { hasValidSession } from "@/auth/access";
import { getCompletedShoppingList } from "@/services/active-shopping-list";

import { unauthorizedResponse } from "../../_lib/responses";
import { activeShoppingListErrorResponse } from "../_lib/responses";

export async function GET() {
  if (!(await hasValidSession())) {
    return unauthorizedResponse();
  }

  try {
    return Response.json({ completedList: await getCompletedShoppingList() });
  } catch (error) {
    return activeShoppingListErrorResponse(error);
  }
}
