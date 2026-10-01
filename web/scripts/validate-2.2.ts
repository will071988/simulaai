import assert from "node:assert/strict";
import { buildStudyPlan, StudyPlanRequestSchema } from "../src/lib/study-plan/engine";

const signals = [
  { discipline: "Direito", weight: 4, answeredCount: 10, errorCount: 8, accuracy: 20 },
  { discipline: "Português", weight: 4, answeredCount: 10, errorCount: 2, accuracy: 80 },
];
const input = { today: "2026-10-01", examDate: "2026-10-21", dailyMinutes: 61, disciplines: signals };
const first = buildStudyPlan(input);
const repeated = buildStudyPlan(input);
assert.deepEqual(repeated, first, "same quantitative inputs must always generate the same plan");
assert.equal(first.daysRemaining, 20);
assert.equal(first.horizonDays, 14);
assert.equal(first.urgency, 1.2);
assert.equal(first.allocation.reduce((sum, item) => sum + item.dailyMinutes, 0), 61);
assert.ok(first.allocation.find((item) => item.discipline === "Direito")!.dailyMinutes > first.allocation.find((item) => item.discipline === "Português")!.dailyMinutes, "weaker discipline with more errors must receive more time when weights are equal");
assert.ok(first.schedule.every((day) => day.totalMinutes === 61));

const improved = buildStudyPlan({ ...input, disciplines: [{ ...signals[0], errorCount: 0, accuracy: 100 }, signals[1]] });
assert.ok(improved.allocation.find((item) => item.discipline === "Direito")!.dailyMinutes < first.allocation.find((item) => item.discipline === "Direito")!.dailyMinutes, "plan must adapt when performance improves");
assert.throws(() => buildStudyPlan({ ...input, examDate: "2026-10-01" }), /EXAM_DATE_MUST_BE_FUTURE/);
assert.equal(StudyPlanRequestSchema.safeParse({ concursoId: "00000000-0000-4000-8000-000000000001", cargo: "Analista", examDate: "2026-12-01", dailyMinutes: 60, disciplines: ["Direito"] }).success, true);
assert.equal(StudyPlanRequestSchema.safeParse({ concursoId: "x", cargo: "A", examDate: "ontem", dailyMinutes: 5, disciplines: [] }).success, false);
console.log("Sprint 2.2 deterministic weighting, exact daily allocation, proximity and performance adaptation tests passed");
