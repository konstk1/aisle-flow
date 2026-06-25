import { hasValidSession } from "@/auth/access";
import { isForeignKeyError } from "@/db/errors";
import {
  getStoreLayout,
  replaceStoreLayout,
  StoreLayoutConflictError,
  storeLayoutSchema,
} from "@/services/store-layout";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../_lib/responses";

export async function GET() {
  if (!(await hasValidSession())) {
    return unauthorizedResponse();
  }

  return Response.json({ layout: await getStoreLayout() });
}

export async function PUT(request: Request) {
  if (!(await hasValidSession())) {
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
    const layout = await replaceStoreLayout(parsed.data);
    return Response.json({ layout });
  } catch (error) {
    if (error instanceof StoreLayoutConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
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
