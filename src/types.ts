export interface WordData {
  id: number;
  word: string;
  hiddenIndex: number;
  position: number;
  isCorrect: boolean | null;
}

export type GameStatus = 'idle' | 'playing' | 'gameover';
