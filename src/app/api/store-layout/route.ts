import { requireSessionUserId } from "@/auth/access";
import { isForeignKeyError } from "@/db/errors";
import {
  getCurrentStoreLayout,
  replaceStoreLayout,
  storeLayoutSchema,
} from "@/services/store-layout";
import { StoreRequestError } from "@/services/stores";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../_lib/responses";

export async function GET() {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  return Response.json({ layout: await getCurrentStoreLayout(userId) });
}

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
      { error: "Send a JSON store layout." },
      { status: 400 },
    );
  }

  const parsed = storeLayoutSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted layout fields.",
    );
  }

  try {
    const layout = await replaceStoreLayout(parsed.data, userId);
    return Response.json({ layout });
  } catch (error) {
    if (error instanceof StoreRequestError) {
      return Response.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: error.status },
      );
    }

    if (isForeignKeyError(error)) {
      return Response.json(
        {
          error:
            "A section with saved product locations cannot be deleted. Move those products first.",
        },
        { status: 409 },
      );
    }

    return Response.json(
      { error: "The layout could not be saved. Try again." },
      { status: 500 },
    );
  }
}
