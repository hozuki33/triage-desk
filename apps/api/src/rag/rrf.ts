export type RankedItem = {
  key: string;
  rank: number;
  weight?: number;
};

export function reciprocalRankFusion(lists: RankedItem[][], rankConstant = 60): Map<string, number> {
  if (rankConstant <= 0) throw new Error("rankConstant must be positive");
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const item of list) {
      if (item.rank < 1) throw new Error("rank must start at 1");
      scores.set(item.key, (scores.get(item.key) ?? 0) + (item.weight ?? 1) / (rankConstant + item.rank));
    }
  }
  return scores;
}
