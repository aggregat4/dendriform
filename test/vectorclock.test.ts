import { test } from './tizzytest'
import expect from 'ceylon'

import { VectorClock } from '../src/ts/lib/vectorclock'

test('sorting two events', () => {
  const vc1 = new VectorClock({ 1: 20, 2: 14 })
  const vc2 = new VectorClock({ 1: 14, 2: 14 })
  const vcArray = [vc1, vc2]
  vcArray.sort((a, b) => a.compare(b))
  expect(vcArray[0]).toEqual(vc2)
  expect(vcArray[1]).toEqual(vc1)
})
