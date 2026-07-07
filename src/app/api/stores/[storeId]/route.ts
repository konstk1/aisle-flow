import { z } from "zod";

import { requireSessionUserId } from "@/auth/access";
import {
  deleteStore,
  renameStore,
  StoreRequestError,
  storeRenameRequestSchema,
} from "@/services/stores";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../../_lib/responses";

const storeIdSchema = z.uuid("Choose a valid store.");
const invalidStoreResponseBody = {
  error: "Choose a valid store.",
  fieldErrors: { storeId: ["Choose a valid store."] },
};

export async function PATCH(
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
    return Response.json(
      { error: "Send a JSON store update." },
      { status: 400 },
    );
  }

  const parsed = storeRenameRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted store fields.",
    );
  }

  try {
    const store = await renameStore(
      parsedStoreId.data,
      parsed.data.name,
      userId,
    );

    return Response.json({ store });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function DELETE(
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

  try {
    await deleteStore(parsedStoreId.data, userId);

    return Response.json({ deleted: true });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

function storeErrorResponse(error: unknown) {
  if (error instanceof StoreRequestError) {
    return Response.json(
      { error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }

  return Response.json(
    { error: "The store could not be saved. Try again." },
    { status: 500 },
  );
}
