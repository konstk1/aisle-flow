import "server-only";

import { z } from "zod";

import { getValidatedGitHubIssuesEnv } from "@/env/schema";
import { FEEDBACK_TEXT_MAX_LENGTH } from "@/services/feedback-constants";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const FEEDBACK_REPOSITORY_OWNER = "konstk1";
const FEEDBACK_REPOSITORY_NAME = "aisle-flow";

export const FEEDBACK_LABEL = "reported-in-app";

const urlSchema = z
  .string()
  .trim()
  .min(1, "Include the page where you are sending feedback from.")
  .max(2_048, "The page URL is too long.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Include a valid page URL.");

export const feedbackRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, "Enter a few details before sending feedback.")
    .max(
      FEEDBACK_TEXT_MAX_LENGTH,
      `Keep reports under ${FEEDBACK_TEXT_MAX_LENGTH} characters.`,
    ),
  pageUrl: urlSchema,
  viewport: z.object({
    width: z
      .number()
      .int()
      .positive("Include a valid viewport width.")
      .max(10_000, "Include a valid viewport width."),
    height: z
      .number()
      .int()
      .positive("Include a valid viewport height.")
      .max(10_000, "Include a valid viewport height."),
    devicePixelRatio: z
      .number()
      .positive("Include a valid device pixel ratio.")
      .max(10, "Include a valid device pixel ratio.")
      .optional(),
  }),
});

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

type FeedbackIssueInput = FeedbackRequest & {
  userAgent: string | null;
};

export type CreatedFeedbackIssue = {
  number: number;
  url: string;
};

type CreateFeedbackIssueOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: Date;
};

export class FeedbackSubmissionError extends Error {}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "aisle-flow-feedback",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

function truncateTitleText(text: string) {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const normalized = (firstLine ?? "Feedback").replace(/\s+/g, " ");
  const normalizedCodePoints = Array.from(normalized);

  return normalizedCodePoints.length > 72
    ? `${normalizedCodePoints.slice(0, 69).join("")}...`
    : normalized;
}

function redactSecret(value: string, secret: string) {
  return secret ? value.split(secret).join("[redacted]") : value;
}

function deploymentContext(env: NodeJS.ProcessEnv) {
  const parts: string[] = [];

  if (env.VERCEL_URL) {
    const url = env.VERCEL_URL.replace(/^https?:\/\//, "");
    parts.push(`Vercel URL: https://${url}`);
  }

  if (env.VERCEL_GIT_COMMIT_SHA) {
    parts.push(`Commit SHA: ${env.VERCEL_GIT_COMMIT_SHA}`);
  }

  return parts.length > 0 ? parts.join("\n") : "Unknown";
}

function formatViewport(viewport: FeedbackRequest["viewport"]) {
  const pixelRatio =
    viewport.devicePixelRatio === undefined
      ? ""
      : ` @ ${viewport.devicePixelRatio}x`;

  return `${viewport.width} x ${viewport.height}${pixelRatio}`;
}

export function buildFeedbackIssuePayload(
  input: FeedbackIssueInput,
  options: { env: NodeJS.ProcessEnv; now: Date; token: string },
) {
  const body = [
    "## Report",
    "",
    input.text,
    "",
    "## Context",
    "",
    `- Page URL: ${input.pageUrl}`,
    `- Submitted at: ${options.now.toISOString()}`,
    `- User agent: ${input.userAgent?.trim() || "Unknown"}`,
    `- Viewport: ${formatViewport(input.viewport)}`,
    "",
    "## Deployment",
    "",
    deploymentContext(options.env),
  ].join("\n");

  return {
    title: redactSecret(
      `In-app feedback: ${truncateTitleText(input.text)}`,
      options.token,
    ),
    body: redactSecret(body, options.token),
    labels: [FEEDBACK_LABEL],
  };
}

async function parseGitHubIssueResponse(response: Response) {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new FeedbackSubmissionError("Invalid GitHub issue response.");
  }

  const parsed = z
    .object({
      number: z.number(),
      html_url: z.string().url(),
    })
    .safeParse(body);

  if (!parsed.success) {
    throw new FeedbackSubmissionError("Invalid GitHub issue response.");
  }

  return parsed.data;
}

async function createGitHubIssue(
  token: string,
  fetcher: typeof fetch,
  payload: ReturnType<typeof buildFeedbackIssuePayload>,
) {
  const response = await fetcher(
    `${GITHUB_API_BASE_URL}/repos/${FEEDBACK_REPOSITORY_OWNER}/${FEEDBACK_REPOSITORY_NAME}/issues`,
    {
      body: JSON.stringify(payload),
      headers: githubHeaders(token),
      method: "POST",
    },
  );

  if (response.status !== 201) {
    throw new FeedbackSubmissionError("GitHub issue was not created.");
  }

  return parseGitHubIssueResponse(response);
}

export async function createFeedbackIssue(
  input: FeedbackIssueInput,
  options: CreateFeedbackIssueOptions = {},
): Promise<CreatedFeedbackIssue> {
  const env = options.env ?? process.env;
  const { GITHUB_ISSUES_TOKEN } = getValidatedGitHubIssuesEnv(env);
  const fetcher = options.fetch ?? fetch;
  const payload = buildFeedbackIssuePayload(input, {
    env,
    now: options.now ?? new Date(),
    token: GITHUB_ISSUES_TOKEN,
  });

  const issue = await createGitHubIssue(GITHUB_ISSUES_TOKEN, fetcher, payload);

  return { number: issue.number, url: issue.html_url };
}
