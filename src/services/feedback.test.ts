import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFeedbackIssue,
  FEEDBACK_LABEL,
  FeedbackSubmissionError,
} from "./feedback";

const token = `github-token-${"x".repeat(20)}`;
const env = {
  GITHUB_ISSUES_TOKEN: token,
  NODE_ENV: "test",
  VERCEL_GIT_COMMIT_SHA: "abc123def456",
  VERCEL_URL: "aisle-flow-git-main-konstk1.vercel.app",
} as NodeJS.ProcessEnv;

const report = {
  text: "The save button failed after I renamed an aisle.",
  pageUrl: "https://aisle-flow.example/",
  userAgent: "Test Browser/1.0",
  userEmail: "shopper@aisle-flow.example",
  viewport: {
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
  },
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("createFeedbackIssue", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("creates a labeled issue", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          number: 45,
          html_url: "https://github.com/konstk1/aisle-flow/issues/45",
        },
        201,
      ),
    );

    const issue = await createFeedbackIssue(report, {
      env,
      fetch: fetchMock as unknown as typeof fetch,
      now: new Date("2026-06-28T12:34:56.000Z"),
    });

    expect(issue).toEqual({
      number: 45,
      url: "https://github.com/konstk1/aisle-flow/issues/45",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/konstk1/aisle-flow/issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const createIssueOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const createIssueBody = JSON.parse(createIssueOptions.body as string) as {
      title: string;
      body: string;
      labels: string[];
    };

    expect(createIssueOptions).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      }),
    );
    expect(createIssueBody).toEqual(
      expect.objectContaining({
        title:
          "In-app: The save button failed after I renamed an aisle.",
        labels: [FEEDBACK_LABEL],
      }),
    );
    expect(createIssueBody.body).toContain(report.text);
    expect(createIssueBody.body).toContain(
      "- Page URL: https://aisle-flow.example/",
    );
    expect(createIssueBody.body).toContain(
      "- Submitted at: 2026-06-28T12:34:56.000Z",
    );
    expect(createIssueBody.body).toContain(
      "- User: shopper@aisle-flow.example",
    );
    expect(createIssueBody.body).toContain("- User agent: Test Browser/1.0");
    expect(createIssueBody.body).toContain("- Viewport: 1440 x 900 @ 2x");
    expect(createIssueBody.body).toContain(
      "Vercel URL: https://aisle-flow-git-main-konstk1.vercel.app",
    );
    expect(createIssueBody.body).toContain("Commit SHA: abc123def456");
  });

  it("redacts the GitHub token if it appears in report metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          number: 45,
          html_url: "https://github.com/konstk1/aisle-flow/issues/45",
        },
        201,
      ),
    );

    await createFeedbackIssue(
      {
        ...report,
        text: `The visible token was ${token}.`,
        userAgent: `Browser ${token}`,
      },
      {
        env,
        fetch: fetchMock as unknown as typeof fetch,
        now: new Date("2026-06-28T12:34:56.000Z"),
      },
    );

    const createIssueOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const createIssueBody = JSON.parse(createIssueOptions.body as string) as {
      title: string;
      body: string;
    };

    expect(createIssueBody.title).not.toContain(token);
    expect(createIssueBody.title).toContain("[redacted]");
    expect(createIssueBody.body).not.toContain(token);
    expect(createIssueBody.body).toContain("[redacted]");
  });

  it("truncates long issue titles without splitting emoji", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          number: 45,
          html_url: "https://github.com/konstk1/aisle-flow/issues/45",
        },
        201,
      ),
    );

    await createFeedbackIssue(
      {
        ...report,
        text: `${"🙂".repeat(73)} feedback`,
      },
      {
        env,
        fetch: fetchMock as unknown as typeof fetch,
        now: new Date("2026-06-28T12:34:56.000Z"),
      },
    );

    const createIssueOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const createIssueBody = JSON.parse(createIssueOptions.body as string) as {
      title: string;
    };

    expect(createIssueBody.title).toBe(
      `In-app: ${"🙂".repeat(69)}...`,
    );
    expect(createIssueBody.title).not.toContain("\uFFFD");
  });

  it("fails safely when issue creation fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "Server error" }, 500),
    );

    await expect(
      createFeedbackIssue(report, {
        env,
        fetch: fetchMock as unknown as typeof fetch,
        now: new Date("2026-06-28T12:34:56.000Z"),
      }),
    ).rejects.toBeInstanceOf(FeedbackSubmissionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
