import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps entity taxonomy literals out of production code", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return ["dev", "sample", "test", "__tests__"].includes(entry.name) ? [] : sources(path);
      return /\.tsx?$/.test(path) && !/\.(test|spec)\./.test(path) ? [path] : [];
    });
  }
  const files = [...sources(join(root, "apps/web/src")), ...readdirSync(join(root, "packages")).flatMap((name) => sources(join(root, "packages", name, "src")))];
  const violations: string[] = [];
  // Canary types: neither quoted literals, union members nor object keys belong in app code.
  const canaries = new Set(["machine", "person"]);
  for (const path of files) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if ((ts.isStringLiteralLike(node) && canaries.has(node.text.toLowerCase())) ||
          (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && canaries.has(node.name.text.toLowerCase()))) {
        violations.push(`${relative(root, path)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(violations).toEqual([]);
});
