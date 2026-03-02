import { describe, it, expect } from "vitest";
import { ISSUE_STATUSES, IssueStatus, WORK_TYPE_LABELS } from "@/lib/labels";

describe("Vitest Setup Smoke Test", () => {
  it("should resolve @/lib/labels import correctly", () => {
    expect(ISSUE_STATUSES).toBeDefined();
    expect(ISSUE_STATUSES).toContain("inception");
    expect(ISSUE_STATUSES).toContain("done");
  });

  it("should have correct IssueStatus type inference", () => {
    const status: IssueStatus = "build";
    expect(ISSUE_STATUSES).toContain(status);
  });

  it("should have work type labels defined", () => {
    expect(WORK_TYPE_LABELS).toBeDefined();
    expect(WORK_TYPE_LABELS).toContain("feature");
    expect(WORK_TYPE_LABELS).toContain("bugfix");
  });
});
