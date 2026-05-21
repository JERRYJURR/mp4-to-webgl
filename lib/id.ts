import { randomBytes } from "node:crypto";

export function newId(prefix = ""): string {
  const id = randomBytes(8).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function newIterationId() {
  return newId("iter");
}

export function newVideoId() {
  return newId("vid");
}
