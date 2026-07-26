import { z } from "zod";

import { unauthorizedResponse } from "@/app/api/_lib/responses";
import { requireSessionUserId } from "@/auth/access";
import {
  createManagedAlias,
  createManagedAliasSchema,
} from "@/services/manage-products";

import {
  manageProductsErrorResponse,
  manageProductsValidationResponse,
  readJsonBody,
} from "../../_lib/responses";

const productIdSchema = z.uuid("Choose a valid product.");

export async function POST(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const userId = await requireSessionUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const { productId } = await context.params;
  const parsedId = productIdSchema.safeParse(productId);
  if (!parsedId.success) {
    return manageProductsValidationResponse(
      parsedId.error,
      "Choose a valid product.",
    );
  }

  const { body, response } = await readJsonBody(request);
  if (response) {
    return response;
  }

  const parsed = createManagedAliasSchema.safeParse(body);
  if (!parsed.success) {
    return manageProductsValidationResponse(
      parsed.error,
      "Check the highlighted alias fields.",
    );
  }

  try {
    return Response.json(
      {
        manageProducts: await createManagedAlias(
          userId,
          parsedId.data,
          parsed.data,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return manageProductsErrorResponse(error);
  }
}
