export interface RunTaskPoolInput<T> {
  items: readonly T[];
  concurrency: number;
  worker: (item: T) => Promise<void>;
}

export async function runTaskPool<T>(input: RunTaskPoolInput<T>): Promise<void> {
  if (!Number.isInteger(input.concurrency) || input.concurrency <= 0) {
    throw new Error("Concorrencia deve ser um inteiro positivo.");
  }

  if (input.items.length === 0) {
    return;
  }

  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(input.concurrency, input.items.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= input.items.length) {
          return;
        }

        await input.worker(input.items[currentIndex]!);
      }
    },
  );

  await Promise.all(workers);
}
