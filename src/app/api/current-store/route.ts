import { requireSessionUserId } from "@/auth/access";
import {
  currentStoreRequestSchema,
  setCurrentStore,
  StoreRequestError,
} from "@/services/stores";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../_lib/responses";

export async function PUT(request: Request) {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Send a JSON store selection." },
      { status: 400 },
    );
  }

  const parsed = currentStoreRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Choose a store to switch to.",
    );
  }

  try {
    const store = await setCurrentStore(userId, parsed.data.storeId);

    return Response.json({ store });
  } catch (error) {
    if (error instanceof StoreRequestError) {
      return Response.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: error.status },
      );
    }

    return Response.json(
      { error: "The store could not be switched. Try again." },
      { status: 500 },
    );
  }
}
