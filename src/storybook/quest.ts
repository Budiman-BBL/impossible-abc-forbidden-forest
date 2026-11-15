/**
 * Storybook slice quest: "Kumpul kayu (0/5)", "Cari batu (0/2)", "Hidupkan unggun api".
 * Pure TypeScript (no Phaser) so it is unit-tested. Wood is kept in GameCore's fire.logs so the
 * existing feed/upgrade rules keep working after the fire is lit.
 */
export const WOOD_GOAL = 5;
export const STONE_GOAL = 2;

export interface QuestState {
  /** Wood collected toward the quest (capped display; the real stock lives in fire.logs). */
  wood: number;
  stones: number;
  lit: boolean;
}

export interface QuestLine {
  text: string;
  done: boolean;
}

export function createQuest(): QuestState {
  return { wood: 0, stones: 0, lit: false };
}

export function addWood(q: QuestState, n = 1): void {
  q.wood = Math.min(WOOD_GOAL, q.wood + n);
}

export function addStone(q: QuestState, n = 1): void {
  q.stones = Math.min(STONE_GOAL, q.stones + n);
}

/** The fire needs the 5 logs and the 2 stones for the ring. */
export function canLight(q: QuestState, logsInStock: number): boolean {
  return !q.lit && q.stones >= STONE_GOAL && logsInStock >= WOOD_GOAL;
}

export function questLines(q: QuestState): QuestLine[] {
  return [
    { text: `Kumpul kayu (${q.wood}/${WOOD_GOAL})`, done: q.wood >= WOOD_GOAL },
    { text: `Cari batu (${q.stones}/${STONE_GOAL})`, done: q.stones >= STONE_GOAL },
    { text: "Hidupkan unggun api", done: q.lit },
  ];
}

export function questDone(q: QuestState): boolean {
  return questLines(q).every((l) => l.done);
}
