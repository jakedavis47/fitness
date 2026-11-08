import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWeight, plateWeight } from '../src/weight.ts'

test('three 45-lb plates plus 15 lb per side is 300 lb total', () => {
  assert.equal(plateWeight(3, 15), 300)
  assert.equal(plateWeight(3, 15) * 10, 3000)
})

test('supports whole plates, fractional extra pounds, and zero-weight sets', () => {
  assert.equal(plateWeight(2, 0), 180)
  assert.equal(plateWeight(1, 2.5), 95)
  assert.equal(plateWeight(0, 15), 30)
  assert.equal(plateWeight(0, 0), 0)
})

test('rejects fractional plates, negative inputs, and non-finite loads', () => {
  for (const [plates, extra] of [
    [1.5, 0], [-1, 15], [3, -15], [NaN, 0], [0, NaN],
    [Infinity, 0], [0, Infinity], [0, Number.MAX_VALUE],
  ]) {
    assert.equal(plateWeight(plates, extra), null)
  }
})

test('preserves plate shorthand and total pounds for saved sets', () => {
  assert.equal(formatWeight({
    weight: 300,
    plateLoading: { platesPerSide: 3, extraPerSide: 15 },
  }), '3 + 15 per side (300 lb)')
})

test('existing sets without plate metadata still display their recorded pounds', () => {
  assert.equal(formatWeight({ weight: 150 }), '150 lb')
  assert.equal(formatWeight({ weight: 0 }), '0 lb')
})
