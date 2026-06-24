import { z } from "zod";

import { hasValidSession } from "@/auth/access";
import {
  getStoreLayout,
  replaceStoreLayout,
  StoreLayoutConflictError,
  storeLayoutSchema,
} from "@/services/store-layout";

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
      error: "Check the highlighted layout fields.",
      fieldErrors,
    },
    { status: 422 },
  );
}

function isForeignKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  );
}

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
    return validationResponse(parsed.error);
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
