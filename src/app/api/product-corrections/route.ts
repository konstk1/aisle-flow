import { requireSessionUserId } from "@/auth/access";
import {
  applyProductCorrection,
  getProductCorrectionOptions,
  ProductCorrectionRequestError,
  productCorrectionRequestSchema,
} from "@/services/product-corrections";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../_lib/responses";

export async function GET() {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    return Response.json({ options: await getProductCorrectionOptions() });
  } catch {
    return Response.json(
      { error: "Correction options could not be loaded. Try again." },
      { status: 500 },
    );
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
      { error: "Send a JSON product correction." },
      { status: 400 },
    );
  }

  const parsed = productCorrectionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted correction fields.",
    );
  }

  try {
    const correction = await applyProductCorrection(userId, parsed.data);
    return Response.json({ correction });
  } catch (error) {
    if (error instanceof ProductCorrectionRequestError) {
      return Response.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: error.status },
      );
    }

    return Response.json(
      { error: "The correction could not be saved. Try again." },
      { status: 500 },
    );
  }
}
