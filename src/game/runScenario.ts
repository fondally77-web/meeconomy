import { judgePuzzle } from './puzzle/ledgerGap.js';
import { scoreRun } from './scoring.js';
import { initRun, simulateMonth } from './simulateMonth.js';
import type { MonthlyOrders, RunResult, RunState } from './types.js';

export const MONTH_LABELS = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];

export function seasonalOrders(s: RunState): MonthlyOrders {
  const m = s.month;
  const meatFocus = m >= 3 && m <= 5;

  return meatFocus
    ? {
        lambsToBuy: 3,
        sheepToShear: 6,
        sheepToShip: 3,
        slaughterQty: 6,
        meatDirectRatio: 0.3,
        spinQty: 0,
        yarnDirectRatio: 0,
        meatRecipes: { genghis: 3, lambCurry: 1 },
        apparelRecipes: {},
        priceStance: 'standard',
        truckAssignment: {
          'farm-meat': 1,
          'farm-wool': 0,
          'meat-delica': 1,
          'meat-sales': 0,
          'delica-sales': 1,
          'wool-apparel': 0,
          'apparel-sales': 0,
        },
      }
    : {
        lambsToBuy: 2,
        sheepToShear: 6,
        sheepToShip: 0,
        slaughterQty: 0,
        meatDirectRatio: 0,
        spinQty: 8,
        yarnDirectRatio: 0.1,
        meatRecipes: {},
        apparelRecipes: m >= 6 ? { sweater: 2, muffler: 2 } : { muffler: 3 },
        priceStance: 'standard',
        truckAssignment: {
          'farm-meat': 0,
          'farm-wool': 1,
          'meat-delica': 0,
          'meat-sales': 0,
          'delica-sales': 0,
          'wool-apparel': 1,
          'apparel-sales': 1,
        },
      };
}

export interface ScenarioStep {
  monthLabel: string;
  result: RunState['history'][number];
}

export interface ScenarioReport {
  seed: number;
  steps: ScenarioStep[];
  finalState: RunState;
  score: RunResult;
}

export function runBalancedScenario(seed: number): ScenarioReport {
  let s = initRun(seed);
  const steps: ScenarioStep[] = [];

  for (let i = 0; i < 12 && !s.bankrupt; i++) {
    const orders = seasonalOrders(s);
    const { next, result } = simulateMonth(s, orders);
    s = next;

    if (s.puzzle) {
      const guess = s.puzzle.answerRowId;
      if (judgePuzzle(s.puzzle, guess)) {
        s.gapsFound++;
        s.cash += 1500;
      }
    }

    steps.push({ monthLabel: MONTH_LABELS[result.month], result });
  }

  return {
    seed,
    steps,
    finalState: s,
    score: scoreRun(s, seed),
  };
}
