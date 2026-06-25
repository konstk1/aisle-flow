import { z } from "zod";

import { hasValidSession } from "@/auth/access";
import {
  applyProductCorrection,
  getProductCorrectionOptions,
  ProductCorrectionRequestError,
  productCorrectionRequestSchema,
} from "@/services/product-corrections";

function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function validationResponse(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";
    fieldErrors[field] ??= [];
    fieldErrors[field].push(issue.message);
  }

  return Response.json(
    {
      error: "Check the highlighted correction fields.",
      fieldErrors,
    },
    { status: 422 },
  );
}

export async function GET() {
  if (!(await hasValidSession())) {
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
  if (!(await hasValidSession())) {
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
    return validationResponse(parsed.error);
  }

  try {
    const correction = await applyProductCorrection(parsed.data);
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
