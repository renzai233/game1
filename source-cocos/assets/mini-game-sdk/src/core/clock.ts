export interface Clock {
  now(): number;
  date(): Date;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  date(): Date {
    return new Date(this.now());
  }
}

export function createSystemClock(): Clock {
  return new SystemClock();
}
