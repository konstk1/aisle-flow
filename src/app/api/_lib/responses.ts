import type { ZodError } from "zod";

export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function zodErrorToFieldErrors(error: ZodError) {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";
    fieldErrors[field] ??= [];
    fieldErrors[field].push(issue.message);
  }

  return fieldErrors;
}

export function validationErrorResponse(error: ZodError, message: string) {
  return Response.json(
    {
      error: message,
      fieldErrors: zodErrorToFieldErrors(error),
    },
    { status: 422 },
  );
}
