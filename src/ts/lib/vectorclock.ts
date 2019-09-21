// from https://github.com/mixu/vectorclock

// Params are containers,
// which have a clock key { clock: {} }

export class VectorClock {
  readonly values = {}

  constructor(values?: any) {
    if (values) {
      this.values = values
    }
  }

  // increments the counter for nodeId
  increment(nodeId): void {
    this.values[nodeId] = (typeof this.values[nodeId] === 'undefined' ? 1 : this.values[nodeId] + 1)
  }

  static allKeys(a, b): any[] {
    let last = null
    return Object.keys(a)
      .concat(Object.keys(b))
      .sort()
      .filter(item => {
        // to make a set of sorted keys unique, just check that consecutive keys are different
        const isDuplicate = (item === last)
        last = item
        return !isDuplicate
      })
  }

  static compareValues(aVals: any, bVals: any): number {
    let isGreater = false
    let isLess = false

    this.allKeys(aVals, bVals).forEach((key) => {
      const diff = (aVals[key] || 0) - (bVals[key] || 0)
      // console.log(`diff for key `, key, ` for `, aVals[key], ` and `, bVals[key], ` is `, diff)
      if (diff > 0) { isGreater = true }
      if (diff < 0) { isLess = true }
    })
    // console.log(`compare a `, aVals, ` b `, bVals, ` isgreater `, isGreater, ` isless `, isLess)
    if (isGreater && isLess) { return 0 }
    if (isLess) { return -1 }
    if (isGreater) { return 1 }
    return 0 // neither is set, so equal
  }

  // like a regular sort function, returns:
  // if a < b: -1
  // if a == b: 0
  // if a > b: 1
  // E.g. if used to sort an array of keys, will order them in ascending order (1, 2, 3 ..)
  compare(b: VectorClock): number {
    return VectorClock.compareValues(this.values, b.values)
  }

// export function ascSort(a, b) {
//   return compare(a, b)
// }

// // sort in descending order (N, ... 3, 2, 1)
// export function descSort(a, b) {
//   return 0 - ascSort(a, b);
// };

  // equal, or not less and not greater than
  isConcurrent(b: VectorClock): boolean {
    return !!(this.compare(b) === 0)
  }

  // identical
  isIdentical(b: VectorClock): boolean {
    return VectorClock.allKeys(this.values, b.values).every((key) => {
      if (typeof this.values[key] === 'undefined' || typeof b.values[key] === 'undefined') { return false }
      return (this.values[key] - b.values[key]) === 0
    })
  }

  // given two vector clocks, returns a new vector clock with all values greater than
  // those of the merged clocks
  merge(b: VectorClock): VectorClock {
    const newValues = {}
    VectorClock.allKeys(this.values, b.values).forEach((key) => {
      newValues[key] = Math.max(this.values[key] || 0, b.values[key] || 0)
    })
    return new VectorClock(newValues)
  }

  serialize(): string {
    return JSON.stringify(this.values)
  }

  static deserialize(serialized: string): VectorClock {
    return new VectorClock(JSON.parse(serialized))
  }

}
