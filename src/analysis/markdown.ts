import { Buffer } from "node:buffer";

import type { Parent, Root, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

import { ANALYSIS_LIMITS, TOKEN_ESTIMATE_METHOD } from "../constants.js";
import { ScopeglassError } from "../error.js";
import type {
  InstructionKind,
  InstructionRecord,
  SourceLocation,
  TokenEstimate,
} from "../types.js";

export interface ExtractMarkdownScopeInput {
  scopeId: string;
  path: string;
  precedence: number;
  text: string;
}

export interface ExtractedReference {
  target: string;
  source: SourceLocation;
}

export interface ExtractMarkdownScopeResult {
  instructions: InstructionRecord[];
  references: ExtractedReference[];
}

type MarkdownNode = Root | RootContent;

interface InstructionWalkContext {
  insideBlockquote: boolean;
  parentType: MarkdownNode["type"] | undefined;
}

function isParent(node: MarkdownNode): node is MarkdownNode & Parent {
  return "children" in node && Array.isArray(node.children);
}

function sourceLocation(node: MarkdownNode, path: string): SourceLocation {
  if (node.position === undefined) {
    throw new Error("Markdown parser omitted a source position.");
  }

  return {
    path,
    startLine: node.position.start.line,
    endLine: node.position.end.line,
  };
}

function tokenEstimate(text: string): TokenEstimate {
  const bytes = Buffer.byteLength(text, "utf8");
  return {
    method: TOKEN_ESTIMATE_METHOD,
    bytes,
    total: Math.ceil(bytes / 3),
  };
}

function plainText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value;
  }
  if (node.type === "image" || node.type === "imageReference") {
    return node.alt ?? "";
  }
  if (node.type === "break") {
    return " ";
  }
  if (node.type === "html" || !isParent(node)) {
    return "";
  }
  return node.children.map((child) => plainText(child)).join("");
}

function normalizedPlainText(node: MarkdownNode): string {
  return plainText(node).replace(/\s+/gu, " ").trim();
}

function exceedsInstructionLength(text: string): boolean {
  let codePoints = 0;
  let offset = 0;

  while (offset < text.length) {
    const codePoint = text.codePointAt(offset);
    offset += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
    codePoints += 1;
    if (codePoints > ANALYSIS_LIMITS.maxInstructionCodePoints) {
      return true;
    }
  }

  return false;
}

function contributesToDepth(node: MarkdownNode): boolean {
  return (
    isParent(node) &&
    node.type !== "root" &&
    node.type !== "paragraph" &&
    node.type !== "heading"
  );
}

function enforceMarkdownDepth(root: Root, path: string): void {
  const stack: { node: MarkdownNode; depth: number }[] = [
    { node: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) {
      break;
    }
    const depth = entry.depth + (contributesToDepth(entry.node) ? 1 : 0);
    if (depth > ANALYSIS_LIMITS.maxMarkdownDepth) {
      throw new ScopeglassError(
        "markdown-depth-exceeded",
        `Markdown nesting exceeds ${ANALYSIS_LIMITS.maxMarkdownDepth}.`,
        { path },
      );
    }
    if (isParent(entry.node)) {
      for (let index = entry.node.children.length - 1; index >= 0; index -= 1) {
        const child = entry.node.children[index];
        if (child !== undefined) {
          stack.push({ node: child, depth });
        }
      }
    }
  }
}

function definitionKey(identifier: string): string {
  return identifier.trim().replace(/\s+/gu, " ").toLowerCase();
}

function collectDefinitions(
  node: MarkdownNode,
  definitions: Map<string, string>,
): void {
  if (node.type === "definition") {
    definitions.set(definitionKey(node.identifier), node.url);
    return;
  }
  if (isParent(node)) {
    for (const child of node.children) {
      collectDefinitions(child, definitions);
    }
  }
}

function isReferenceCandidate(target: string): boolean {
  const pathEnd = target.search(/[?#]/u);
  const targetPath = pathEnd === -1 ? target : target.slice(0, pathEnd);
  if (targetPath.length === 0 || targetPath.startsWith("/")) {
    return false;
  }

  const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(targetPath);
  const isWindowsDriveForm = /^[A-Za-z]:/u.test(targetPath);
  return !hasScheme || isWindowsDriveForm;
}

export function extractMarkdownScope(
  input: ExtractMarkdownScopeInput,
): ExtractMarkdownScopeResult {
  const root = fromMarkdown(input.text);
  enforceMarkdownDepth(root, input.path);

  const instructions: InstructionRecord[] = [];
  const references: ExtractedReference[] = [];
  const definitions = new Map<string, string>();
  const ordinalsByLine = new Map<number, number>();
  let section: string[] = [];

  collectDefinitions(root, definitions);

  function addInstruction(node: MarkdownNode, kind: InstructionKind): void {
    const text = normalizedPlainText(node);
    if (text.length === 0) {
      return;
    }
    if (exceedsInstructionLength(text)) {
      throw new ScopeglassError(
        "instruction-too-long",
        `An instruction exceeds ${ANALYSIS_LIMITS.maxInstructionCodePoints} code points.`,
        { path: input.path },
      );
    }
    if (instructions.length >= ANALYSIS_LIMITS.maxInstructions) {
      throw new ScopeglassError(
        "instruction-limit-exceeded",
        `Markdown contains more than ${ANALYSIS_LIMITS.maxInstructions} instructions.`,
        { path: input.path },
      );
    }

    const source = sourceLocation(node, input.path);
    const ordinal = ordinalsByLine.get(source.startLine) ?? 0;
    ordinalsByLine.set(source.startLine, ordinal + 1);
    instructions.push({
      id: `instruction:${input.precedence}:${source.startLine}:${ordinal}`,
      scopeId: input.scopeId,
      kind,
      text,
      section: [...section],
      precedence: input.precedence,
      source,
      tokenEstimate: tokenEstimate(text),
    });
  }

  function walkInstructions(
    node: MarkdownNode,
    context: InstructionWalkContext,
  ): void {
    if (node.type === "heading") {
      section = section.slice(0, node.depth - 1);
      section.push(normalizedPlainText(node));
      return;
    }
    if (node.type === "paragraph") {
      if (context.insideBlockquote) {
        addInstruction(node, "blockquote");
      } else if (context.parentType === "listItem") {
        addInstruction(node, "list-item");
      } else if (context.parentType === "root") {
        addInstruction(node, "paragraph");
      }
      return;
    }
    if (!isParent(node)) {
      return;
    }

    const insideBlockquote =
      context.insideBlockquote || node.type === "blockquote";
    for (const child of node.children) {
      walkInstructions(child, { insideBlockquote, parentType: node.type });
    }
  }

  function addReference(node: MarkdownNode, target: string): void {
    if (!isReferenceCandidate(target)) {
      return;
    }
    if (references.length >= ANALYSIS_LIMITS.maxReferences) {
      throw new ScopeglassError(
        "reference-limit-exceeded",
        `Markdown contains more than ${ANALYSIS_LIMITS.maxReferences} local references.`,
        { path: input.path },
      );
    }
    references.push({ target, source: sourceLocation(node, input.path) });
  }

  function walkReferences(node: MarkdownNode): void {
    if (node.type === "link") {
      addReference(node, node.url);
    } else if (node.type === "linkReference") {
      const target = definitions.get(definitionKey(node.identifier));
      if (target !== undefined) {
        addReference(node, target);
      }
    }
    if (
      node.type !== "image" &&
      node.type !== "imageReference" &&
      isParent(node)
    ) {
      for (const child of node.children) {
        walkReferences(child);
      }
    }
  }

  walkInstructions(root, { insideBlockquote: false, parentType: undefined });
  walkReferences(root);

  return { instructions, references };
}
