import { hasValidSession } from "@/auth/access";
import {
  createFeedbackIssue,
  feedbackRequestSchema,
} from "@/services/feedback";

import {
  fieldErrorsResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "../_lib/responses";

const validationMessage = "Check the highlighted report fields.";

function pageUrlOriginMatchesRequest(pageUrl: string, origin: string | null) {
  if (!origin) {
    return true;
  }

  try {
    return new URL(pageUrl).origin === origin;
  } catch {
    return false;
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
      { error: "Send a JSON feedback report." },
      { status: 400 },
    );
  }

  const parsed = feedbackRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error, validationMessage);
  }

  if (
    !pageUrlOriginMatchesRequest(
      parsed.data.pageUrl,
      request.headers.get("origin"),
    )
  ) {
    return fieldErrorsResponse(
      {
        pageUrl: ["Report from the current application page."],
      },
      validationMessage,
    );
  }

  try {
    const issue = await createFeedbackIssue({
      ...parsed.data,
      userAgent: request.headers.get("user-agent"),
    });

    return Response.json({ issue });
  } catch {
    return Response.json(
      { error: "Feedback could not be submitted. Try again later." },
      { status: 502 },
    );
  }
}
