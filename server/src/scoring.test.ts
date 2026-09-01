import { test } from "node:test";
import assert from "node:assert/strict";
import { tierForScore } from "./scoring.js";

test("tierForScore: low band 0-35, exact boundaries", () => {
  assert.equal(tierForScore(0), "low");
  assert.equal(tierForScore(20), "low");
  assert.equal(tierForScore(35), "low");
});

test("tierForScore: medium band 36-65, exact boundaries", () => {
  assert.equal(tierForScore(36), "medium");
  assert.equal(tierForScore(50), "medium");
  assert.equal(tierForScore(65), "medium");
});

test("tierForScore: high band 66-100, exact boundaries", () => {
  assert.equal(tierForScore(66), "high");
  assert.equal(tierForScore(85), "high");
  assert.equal(tierForScore(100), "high");
});
