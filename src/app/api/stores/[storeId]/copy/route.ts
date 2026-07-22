import { z } from "zod";

import { requireSessionUserId } from "@/auth/access";
import { copyStoreRoute } from "@/services/store-layout";
import {
  setCurrentStore,
  StoreRequestError,
  storeCopyRequestSchema,
} from "@/services/stores";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../../../_lib/responses";

const storeIdSchema = z.uuid("Choose a valid store.");
const invalidStoreResponseBody = {
  error: "Choose a valid store.",
  fieldErrors: { sourceStoreId: ["Choose a valid store."] },
};

export async function POST(
  request: Request,
  context: { params: Promise<{ storeId: string }> },
) {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  const { storeId } = await context.params;
  const parsedStoreId = storeIdSchema.safeParse(storeId);

  if (!parsedStoreId.success) {
    return Response.json(invalidStoreResponseBody, { status: 422 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON store copy." }, { status: 400 });
  }

  const parsed = storeCopyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted store fields.",
    );
  }

  try {
    const store = await copyStoreRoute(
      parsedStoreId.data,
      parsed.data.name,
      userId,
    );
    await setCurrentStore(userId, store.id);

    return Response.json({ store });
  } catch (error) {
    if (error instanceof StoreRequestError) {
      return Response.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: error.status },
      );
    }

    return Response.json(
      { error: "The store could not be copied. Try again." },
      { status: 500 },
    );
  }
}
