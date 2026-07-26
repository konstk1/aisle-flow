import { requireSessionUserId } from "@/auth/access";
import { unauthorizedResponse } from "@/app/api/_lib/responses";
import {
  createManagedProduct,
  createManagedProductSchema,
  getManageProducts,
} from "@/services/manage-products";

import {
  manageProductsErrorResponse,
  manageProductsValidationResponse,
  readJsonBody,
} from "./_lib/responses";

export async function GET() {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    return Response.json({ manageProducts: await getManageProducts(userId) });
  } catch (error) {
    return manageProductsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  const { body, response } = await readJsonBody(request);
  if (response) {
    return response;
  }

  const parsed = createManagedProductSchema.safeParse(body);
  if (!parsed.success) {
    return manageProductsValidationResponse(
      parsed.error,
      "Check the highlighted product fields.",
    );
  }

  try {
    return Response.json(
      { manageProducts: await createManagedProduct(userId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return manageProductsErrorResponse(error);
  }
}
