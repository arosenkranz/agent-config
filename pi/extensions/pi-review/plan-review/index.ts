/**
 * Plan reviewer module.
 *
 * Makes plan presentations always-on: before each agent run the system prompt
 * gains guidance to use present_plan instead of writing plans in chat, and
 * the present_plan tool renders the plan as an HTML presentation with
 * per-section feedback controls, opened in Chrome under the agent-plans
 * convention. Plain language is enforced by slop-check before rendering.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Static } from "typebox";

import { checkProse, formatFindings, type ProseField, type SlopFinding } from "../shared/slop-check.ts";
import { renderPlanPage, renderResponsesMd, type Presentation, type PresentationSection } from "../shared/html-builder.ts";

// ---------------------------------------------------------------------------
// Prompt guidance
// ---------------------------------------------------------------------------

const PLAN_GUIDANCE = `## Plan presentations (always on)

Before writing any substantive plan (more than one step or one real decision) in chat, call the present_plan tool. This is mandatory: do not write the full plan in chat, and do not ask the user whether they want a presentation. This replaces the html-plan-presentations skill's ask-first behavior.

present_plan takes sections. Each section has a stable kebab-case id, a title, a one-sentence takeaway, a markdown body, and optionally a diagram description and a feedback control (decision, notes, or approval). After the call succeeds, tell the user the returned file paths and summarize the plan in at most three sentences. Do not restate the whole plan in chat.

Write section bodies for the decision-maker first. Put detailed code, schemas, command lines, and low-level implementation notes in a final section titled "Addendum".

The prose must be free of mechanical AI-writing tells or the call is rejected: no puffery (comprehensive, leverage, delve, streamline, additionally, crucial, pivotal, testament, showcase, vibrant, foster, utilize, facilitate, numerous), no "not just X but Y" shapes, no chatbot openers ("Great question", "Of course!"), no hollow phrases ("in today's fast-paced world", "the future looks bright"), no curly quotes, no em dashes (use periods or commas), no filler ("in order to", "due to the fact that", "it is important to note"). If the call is rejected with a list of findings, rewrite the flagged lines and call again. Technical detail is never banned. Only the tells above are.`;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FeedbackInput {
  kind: "decision" | "notes" | "approval";
  label?: string;
  options?: string[];
}

interface SectionInput {
  id: string;
  title: string;
  takeaway: string;
  body: string;
  diagram?: string;
  feedback?: FeedbackInput;
}

const SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const FEEDBACK_KINDS = ["decision", "notes", "approval"] as const;
type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

function isFeedbackKind(value: string): value is FeedbackKind {
  return (FEEDBACK_KINDS as readonly string[]).includes(value);
}

interface RawFeedback {
  kind: string;
  label?: string;
  options?: string[];
}

interface RawSection {
  id: string;
  title: string;
  takeaway: string;
  body: string;
  diagram?: string;
  feedback?: RawFeedback;
}

interface RawInput {
  title: string;
  subtitle?: string;
  sections: RawSection[];
}

/** Narrow the schema-widened input (StringEnum kinds arrive as string) into typed data. */
function normalizeInput(raw: RawInput): { title: string; subtitle?: string; sections: SectionInput[] } {
  const sections = raw.sections.map((section) => {
    if (section.feedback && !isFeedbackKind(section.feedback.kind)) {
      throw new Error(`Section "${section.id}": feedback.kind must be one of ${FEEDBACK_KINDS.join(", ")}.`);
    }
    return section as SectionInput;
  });
  return {
    title: raw.title,
    ...(raw.subtitle ? { subtitle: raw.subtitle } : {}),
    sections,
  };
}

/** Semantic validation on top of the schema. Throws user-actionable errors. */
function validateSections(sections: SectionInput[]): void {
  const seenIds = new Set<string>();
  for (const [index, section] of sections.entries()) {
    if (!SECTION_ID_PATTERN.test(section.id)) {
      throw new Error(
        `Section ${index + 1}: id "${section.id}" must be kebab-case (lowercase letters, digits, hyphens), e.g. "section-approach".`,
      );
    }
    if (seenIds.has(section.id)) {
      throw new Error(`Duplicate section id "${section.id}". Each section needs a unique id.`);
    }
    seenIds.add(section.id);

    const feedback = section.feedback;
    if (!feedback) continue;
    if (feedback.kind === "decision" && (!feedback.options || feedback.options.length < 2)) {
      throw new Error(`Section "${section.id}": decision feedback needs at least 2 options.`);
    }
    if (feedback.kind !== "decision" && feedback.options) {
      throw new Error(`Section "${section.id}": only decision feedback accepts options.`);
    }
  }
}

/** Collect every prose field for slop checking, in presentation order. */
function collectProseFields(title: string, subtitle: string | undefined, sections: SectionInput[]): ProseField[] {
  const fields: ProseField[] = [{ location: "title", text: title }];
  if (subtitle) fields.push({ location: "subtitle", text: subtitle });
  for (const section of sections) {
    const where = `section '${section.id}'`;
    fields.push({ location: `${where} title`, text: section.title });
    fields.push({ location: `${where} takeaway`, text: section.takeaway });
    fields.push({ location: `${where} body`, text: section.body });
    if (section.diagram) fields.push({ location: `${where} diagram`, text: section.diagram });
  }
  return fields;
}

/** Build the rejection message the agent receives when prose fails the check. */
function slopRejection(findings: SlopFinding[]): Error {
  return new Error(
    `Plan prose rejected by the plain-language check. Rewrite the flagged lines and call present_plan again:\n${formatFindings(findings)}`,
  );
}

// ---------------------------------------------------------------------------
// Plan directory and page writing
// ---------------------------------------------------------------------------

const WORKSPACE_PLANS_DIR = path.join(os.homedir(), "workspace", "agent-plans");

/**
 * Candidate output locations, most conventional first. Sandboxed pi sessions
 * can only write under the session workdir and a few granted paths, so the
 * conventional ~/workspace/agent-plans is not always writable.
 */
function candidateBaseDirs(cwd: string): string[] {
  const piDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  return [WORKSPACE_PLANS_DIR, path.join(cwd, "agent-plans"), path.join(piDir, "agent-plans")];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Local timestamp as YYYY-MM-DD-HHMM, verified from the machine clock. */
function localStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Presentation timestamp with local offset, e.g. 2026-09-09T09:57:00-05:00. */
function localIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
  );
}

/** Directory for this plan; never overwrites an existing plan dir. */
function uniquePlanDir(baseDir: string, now: Date, slug: string): string {
  const base = `${localStamp(now)}-${slug}`;
  let candidate = path.join(baseDir, base);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(baseDir, `${base}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

async function writePlanPage(
  presentation: Presentation,
  cwd: string,
): Promise<{ dir: string; page: string; responses: string }> {
  const now = new Date();
  const slug = slugify(presentation.title);
  const html = renderPlanPage(presentation);
  const markdown = renderResponsesMd(presentation);
  const failures: string[] = [];

  for (const baseDir of candidateBaseDirs(cwd)) {
    try {
      const dir = uniquePlanDir(baseDir, now, slug);
      const page = path.join(dir, "index.html");
      const responses = path.join(dir, "responses.md");
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(page, html, "utf8");
      await fsp.writeFile(responses, markdown, "utf8");
      return { dir, page, responses };
    } catch (error) {
      failures.push(`${baseDir}: ${errorMessage(error)}`);
    }
  }
  throw new Error(`No writable location for the plan page. Tried:\n${failures.join("\n")}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Open the page in Chrome, falling back to the default browser. Never throws. */
async function openInChrome(pi: ExtensionAPI, page: string): Promise<boolean> {
  try {
    const chrome = await pi.exec("open", ["-a", "Google Chrome", page]);
    if (chrome.code === 0) return true;
    const fallback = await pi.exec("open", [page]);
    return fallback.code === 0;
  } catch (error) {
    logOpenFailure(page, error);
    return false;
  }
}

function logOpenFailure(page: string, error: unknown): void {
  // Never fail the plan tool on an open error; the page is still readable.
  console.error(`pi-review: could not open ${page}: ${String(error)}`);
}

// ---------------------------------------------------------------------------
// Module registration
// ---------------------------------------------------------------------------

function toPresentation(input: Static<typeof planParameters>, generatedAt: string): Presentation {
  const sections: PresentationSection[] = input.sections.map((section) => {
    const feedback =
      section.feedback === undefined
        ? undefined
        : section.feedback.kind === "decision"
          ? {
              kind: "decision" as const,
              label: section.feedback.label ?? "Decision",
              options: section.feedback.options ?? [],
            }
          : section.feedback.kind === "notes"
            ? { kind: "notes" as const, label: section.feedback.label ?? "Notes" }
            : { kind: "approval" as const, label: section.feedback.label ?? "Approve this section" };
    return {
      id: section.id,
      title: section.title,
      takeaway: section.takeaway,
      body: section.body,
      ...(section.diagram ? { diagram: section.diagram } : {}),
      ...(feedback ? { feedback } : {}),
    };
  });
  return {
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    generatedAt,
    sections,
  };
}

const planParameters = Type.Object({
  title: Type.String({ description: "Plan title, sentence case." }),
  subtitle: Type.Optional(Type.String({ description: "One line of context under the title." })),
  sections: Type.Array(
    Type.Object({
      id: Type.String({ description: "Stable kebab-case section id, e.g. section-approach." }),
      title: Type.String({ description: "Section heading, sentence case." }),
      takeaway: Type.String({ description: "One-sentence takeaway shown under the heading." }),
      body: Type.String({
        description: "Section body, markdown. Decision-maker language first; technical detail goes in a final Addendum section.",
      }),
      diagram: Type.Optional(Type.String({ description: "Optional diagram description, markdown." })),
      feedback: Type.Optional(
        Type.Object({
          kind: StringEnum(["decision", "notes", "approval"], {
            description: "Feedback control for this section: decision (radio options), notes (text box), or approval (checkbox).",
          }),
          label: Type.Optional(Type.String({ description: "Control label." })),
          options: Type.Optional(Type.Array(Type.String(), { description: "Radio options, decision kind only." })),
        }),
      ),
    }),
    { minItems: 1 },
  ),
});

const SUCCESS_TAIL = `Tell the user the paths above in chat and summarize the plan in at most three sentences. Feedback is given per section; the "Copy feedback for Pi" button builds a markdown summary for pasting back into this session.`;

const OPEN_FAILED_TAIL = `The extension could not open Chrome directly. Open the page yourself with the bash tool: open -a "Google Chrome" <page path> (if that also fails, give the user the path and the open command to run).`;

export function registerPlanReview(pi: ExtensionAPI): void {
  let enabled = true;

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${PLAN_GUIDANCE}`,
    };
  });

  pi.registerTool({
    name: "present_plan",
    label: "Present plan",
    description:
      "Present a substantive plan as an interactive HTML presentation opened in Chrome, with per-section feedback controls and a copy-back button. Use this instead of writing the plan in chat whenever the plan has more than one step or one real decision. Plain-language rules are enforced: mechanical AI-writing tells cause rejection.",
    promptSnippet: "Present substantive plans as an HTML review page instead of chat prose",
    promptGuidelines: [
      "Use present_plan for every substantive plan (more than one step or one real decision) instead of writing the plan in chat. Do not ask the user first; call it directly, then share the returned file paths and wait for feedback.",
    ],
    parameters: planParameters,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const input = normalizeInput(params);
      validateSections(input.sections);

      const findings = checkProse(collectProseFields(input.title, input.subtitle, input.sections));
      if (findings.length > 0) {
        throw slopRejection(findings);
      }

      const presentation = toPresentation(input, localIso(new Date()));
      const { dir, page, responses } = await writePlanPage(presentation, _ctx.cwd);
      const opened = await openInChrome(pi, page);
      const head = opened
        ? `Plan presentation written and opened in Chrome.\n- Page: ${page}\n- Responses fallback: ${responses}\n- Directory: ${dir}\n\n${SUCCESS_TAIL}`
        : `Plan presentation written.\n- Page: ${page}\n- Responses fallback: ${responses}\n- Directory: ${dir}\n\n${OPEN_FAILED_TAIL}\n\n${SUCCESS_TAIL}`;

      return {
        content: [
          {
            type: "text",
            text: head,
          },
        ],
        details: { dir, page, responses, opened },
      };
    },
  });
}
