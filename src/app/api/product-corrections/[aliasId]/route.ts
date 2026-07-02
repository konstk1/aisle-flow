import { z } from "zod";

import { requireSessionUserId } from "@/auth/access";
import {
  deleteLearnedProduct,
  learnedProductUpdateRequestSchema,
  ProductCorrectionRequestError,
  updateLearnedProduct,
} from "@/services/product-corrections";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../../_lib/responses";

const aliasIdSchema = z.uuid("Choose a valid learned product.");
const invalidAliasResponseBody = {
  error: "Choose a valid learned product.",
  fieldErrors: { aliasId: ["Choose a valid learned product."] },
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ aliasId: string }> },
) {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  const { aliasId } = await context.params;
  const parsedAliasId = aliasIdSchema.safeParse(aliasId);

  if (!parsedAliasId.success) {
    return Response.json(invalidAliasResponseBody, { status: 422 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Send a JSON learned-product update." },
      { status: 400 },
    );
  }

  const parsed = learnedProductUpdateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted learned-product fields.",
    );
  }

  try {
    const learnedProducts = await updateLearnedProduct(
      userId,
      parsedAliasId.data,
      parsed.data,
    );

    return Response.json({ learnedProducts });
  } catch (error) {
    return learnedProductErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ aliasId: string }> },
) {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  const { aliasId } = await context.params;
  const parsedAliasId = aliasIdSchema.safeParse(aliasId);

  if (!parsedAliasId.success) {
    return Response.json(invalidAliasResponseBody, { status: 422 });
  }

  try {
    const learnedProducts = await deleteLearnedProduct(
      userId,
      parsedAliasId.data,
    );

    return Response.json({ learnedProducts });
  } catch (error) {
    return learnedProductErrorResponse(error);
  }
}

function learnedProductErrorResponse(error: unknown) {
  if (error instanceof ProductCorrectionRequestError) {
    return Response.json(
      { error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }

  return Response.json(
    { error: "The learned product could not be saved. Try again." },
    { status: 500 },
  );
}
