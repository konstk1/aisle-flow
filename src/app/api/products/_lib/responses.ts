import type { ZodError } from "zod";

import { validationErrorResponse } from "@/app/api/_lib/responses";
import { ManageProductsRequestError } from "@/services/manage-products";

export function manageProductsValidationResponse(
  error: ZodError,
  message: string,
) {
  return validationErrorResponse(error, message);
}

export function manageProductsErrorResponse(error: unknown) {
  if (error instanceof ManageProductsRequestError) {
    return Response.json(
      { error: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }

  return Response.json(
    { error: "Products could not be saved. Try again." },
    { status: 500 },
  );
}

export async function readJsonBody(request: Request) {
  try {
    return { body: await request.json(), response: null };
  } catch {
    return {
      body: null,
      response: Response.json(
        { error: "Send a JSON product update." },
        { status: 400 },
      ),
    };
  }
}
