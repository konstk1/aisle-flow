import { z } from "zod";

import { unauthorizedResponse } from "@/app/api/_lib/responses";
import { requireSessionUserId } from "@/auth/access";
import {
  deleteManagedAlias,
  updateManagedAlias,
  updateManagedAliasSchema,
} from "@/services/manage-products";

import {
  manageProductsErrorResponse,
  manageProductsValidationResponse,
  readJsonBody,
} from "../../../_lib/responses";

const paramsSchema = z.object({
  productId: z.uuid("Choose a valid product."),
  aliasId: z.uuid("Choose a valid alias."),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string; aliasId: string }> },
) {
  const userId = await requireSessionUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return manageProductsValidationResponse(
      parsedParams.error,
      "Choose a valid product alias.",
    );
  }

  const { body, response } = await readJsonBody(request);
  if (response) {
    return response;
  }

  const parsed = updateManagedAliasSchema.safeParse(body);
  if (!parsed.success) {
    return manageProductsValidationResponse(
      parsed.error,
      "Check the highlighted alias fields.",
    );
  }

  try {
    return Response.json({
      manageProducts: await updateManagedAlias(
        userId,
        parsedParams.data.productId,
        parsedParams.data.aliasId,
        parsed.data,
      ),
    });
  } catch (error) {
    return manageProductsErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ productId: string; aliasId: string }> },
) {
  const userId = await requireSessionUserId();
  if (!userId) {
    return unauthorizedResponse();
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return manageProductsValidationResponse(
      parsedParams.error,
      "Choose a valid product alias.",
    );
  }

  try {
    return Response.json({
      manageProducts: await deleteManagedAlias(
        userId,
        parsedParams.data.productId,
        parsedParams.data.aliasId,
      ),
    });
  } catch (error) {
    return manageProductsErrorResponse(error);
  }
}
