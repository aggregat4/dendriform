import { test } from './tizzytest'
import expect from 'ceylon'

import {isEmpty} from '../src/ts/utils/util'

// describe('isEmpty tries to determine wheter a string is undefined or just whitespace', () => {
  test('empty examples', () => {
    expect(isEmpty(null)).toBe(true)
    expect(isEmpty(undefined)).toBe(true)
    expect(isEmpty('')).toBe(true)
    expect(isEmpty(' ')).toBe(true)
    expect(isEmpty('   ')).toBe(true)
  })

  test('non-empty examples', () => {
    expect(isEmpty('a')).toBe(false)
    expect(isEmpty(' a')).toBe(false)
    expect(isEmpty(' a   ')).toBe(false)
  })
