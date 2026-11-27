const FIRST_CAPACITY = 1024;

export class SampleTable {
  readonly columns: ReadonlyArray<string>;
  private readonly indexByName: ReadonlyMap<string, number>;
  private storage: Array<Float32Array>;
  private rows = 0;

  constructor(columns: ReadonlyArray<string>, capacity = FIRST_CAPACITY) {
    this.columns = columns;
    this.indexByName = new Map(columns.map((name, index) => [name, index]));
    this.storage = columns.map(() => new Float32Array(Math.max(capacity, 1)));
  }

  static fromColumns(
    time: ReadonlyArray<number>,
    columns: Readonly<Record<string, ReadonlyArray<number>>>,
  ) {
    const names = ["t", ...Object.keys(columns).filter((name) => name !== "t")];
    const table = new SampleTable(names, time.length);

    table.storage = names.map((name) =>
      Float32Array.from(name === "t" ? time : (columns[name] ?? [])),
    );
    table.rows = time.length;

    return table;
  }

  get length() {
    return this.rows;
  }

  get startTime() {
    return this.rows === 0 ? 0 : this.at(0, 0);
  }

  get endTime() {
    return this.rows === 0 ? 0 : this.at(0, this.rows - 1);
  }

  has(name: string) {
    return this.indexByName.has(name);
  }

  append(values: Float32Array) {
    const capacity = this.storage[0]?.length ?? 0;

    if (this.rows === capacity) this.grow(capacity * 2);

    for (let column = 0; column < this.storage.length; column += 1) {
      const target = this.storage[column];

      if (target !== undefined) target[this.rows] = values[column] ?? Number.NaN;
    }

    this.rows += 1;
  }

  column(name: string): Float32Array {
    const index = this.indexByName.get(name);
    const storage = index === undefined ? undefined : this.storage[index];

    return storage === undefined ? new Float32Array(0) : storage.subarray(0, this.rows);
  }

  value(name: string, row: number) {
    const index = this.indexByName.get(name);

    return index === undefined ? Number.NaN : this.at(index, row);
  }

  rowAt(t: number) {
    if (this.rows === 0) return -1;

    const time = this.storage[0];

    if (time === undefined) return -1;

    let low = 0;
    let high = this.rows - 1;

    if (t <= (time[0] ?? 0)) return 0;

    if (t >= (time[high] ?? 0)) return high;

    while (low < high) {
      const middle = (low + high + 1) >> 1;

      if ((time[middle] ?? 0) <= t) low = middle;
      else high = middle - 1;
    }

    return low;
  }

  sample(name: string, t: number) {
    const index = this.indexByName.get(name);
    const row = this.rowAt(t);

    if (index === undefined || row < 0) return Number.NaN;

    const next = Math.min(row + 1, this.rows - 1);
    const t0 = this.at(0, row);
    const t1 = this.at(0, next);
    const v0 = this.at(index, row);

    if (next === row || t1 <= t0 || t <= t0) return v0;

    const fraction = Math.min(1, (t - t0) / (t1 - t0));

    return v0 + (this.at(index, next) - v0) * fraction;
  }

  private at(column: number, row: number) {
    return this.storage[column]?.[row] ?? Number.NaN;
  }

  private grow(capacity: number) {
    this.storage = this.storage.map((old) => {
      const next = new Float32Array(Math.max(capacity, 1));

      next.set(old);

      return next;
    });
  }
}
