/**
 * delay.ts
 * Utilità per aspettare un certo numero di millisecondi
 */

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
