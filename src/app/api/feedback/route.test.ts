import { beforeEach, describe, expect, it, vi } from "vitest";

const { createFeedbackIssue, getServerSession } = vi.hoisted(() => ({
  createFeedbackIssue: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ getServerSession }));

const session = {
  user: { id: "user-1", email: "shopper@aisle-flow.example" },
};
vi.mock("@/services/feedback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/feedback")>();

  return {
    ...actual,
    createFeedbackIssue,
  };
});

import { FeedbackSubmissionError } from "@/services/feedback";

import { POST } from "./route";

function feedbackRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request("https://aisle-flow.example/api/feedback", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Test Browser/1.0",
      ...headers,
    },
    method: "POST",
  });
}

const validBody = {
  text: "The route editor failed after I renamed an aisle.",
  pageUrl: "https://aisle-flow.example/",
  viewport: {
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
  },
};

describe("feedback route", () => {
  beforeEach(() => {
    createFeedbackIssue.mockReset();
    getServerSession.mockResolvedValue(null);
  });

  it("rejects unauthenticated reports before parsing the body", async () => {
    const response = await POST(
      new Request("https://aisle-flow.example/api/feedback", {
        body: "not json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(createFeedbackIssue).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON for authenticated callers", async () => {
    getServerSession.mockResolvedValue(session);

    const response = await POST(
      new Request("https://aisle-flow.example/api/feedback", {
        body: "not json",
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Send a JSON feedback report.",
    });
    expect(createFeedbackIssue).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid report input", async () => {
    getServerSession.mockResolvedValue(session);

    const response = await POST(
      feedbackRequest({
        text: "too short",
        pageUrl: "not a url",
        viewport: { width: 0, height: 900, devicePixelRatio: 2 },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("Check the highlighted report fields.");
    expect(body.fieldErrors).toEqual(
      expect.objectContaining({
        text: ["Enter a few details before sending feedback."],
        pageUrl: ["Include a valid page URL."],
        "viewport.width": ["Include a valid viewport width."],
      }),
    );
    expect(createFeedbackIssue).not.toHaveBeenCalled();
  });

  it("rejects oversized report text", async () => {
    getServerSession.mockResolvedValue(session);

    const response = await POST(
      feedbackRequest({
        ...validBody,
        text: "x".repeat(4_001),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.fieldErrors.text).toEqual([
      "Keep reports under 4000 characters.",
    ]);
    expect(createFeedbackIssue).not.toHaveBeenCalled();
  });

  it("rejects reports whose page URL does not match the request origin", async () => {
    getServerSession.mockResolvedValue(session);

    const response = await POST(
      feedbackRequest(
        {
          ...validBody,
          pageUrl: "https://attacker.example/",
        },
        { Origin: "https://aisle-flow.example" },
      ),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Check the highlighted report fields.",
      fieldErrors: {
        pageUrl: ["Report from the current application page."],
      },
    });
    expect(createFeedbackIssue).not.toHaveBeenCalled();
  });

  it("creates feedback issues for valid reports", async () => {
    getServerSession.mockResolvedValue(session);
    createFeedbackIssue.mockResolvedValue({
      number: 45,
      url: "https://github.com/konstk1/aisle-flow/issues/45",
    });

    const response = await POST(
      feedbackRequest({
        ...validBody,
        text: `  ${validBody.text}  `,
      }),
    );

    expect(response.status).toBe(200);
    expect(createFeedbackIssue).toHaveBeenCalledWith({
      ...validBody,
      text: validBody.text,
      userAgent: "Test Browser/1.0",
      userEmail: "shopper@aisle-flow.example",
    });
    await expect(response.json()).resolves.toEqual({
      issue: {
        number: 45,
        url: "https://github.com/konstk1/aisle-flow/issues/45",
      },
    });
  });

  it("returns a safe error when GitHub submission fails", async () => {
    const token = `github-token-${"x".repeat(20)}`;
    getServerSession.mockResolvedValue(session);
    createFeedbackIssue.mockRejectedValue(
      new FeedbackSubmissionError(`GitHub rejected ${token}`),
    );

    const response = await POST(feedbackRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "Feedback could not be submitted. Try again later.",
    });
    expect(JSON.stringify(body)).not.toContain(token);
  });
});
