import { it, expect } from 'vitest'
import { examScores, scoreText } from './examScores'
it('alan puanları ayrı tutulur; TYT ya da başka alan kendiliğinden seçilmez', () => {
  const scores = examScores({ scores: { SAY: 312.985, EA: 263.056, SOZ: 327.917, TYT: 180, DIL: null } })
  expect(scores).toEqual({ SAY: 312.985, EA: 263.056, SOZ: 327.917 })
  expect(scoreText({ score: null, scores })).toBe('SAY: 312,985 · EA: 263,056 · SÖZ: 327,917')
  expect(examScores({ scores: { SAY: '312.985', EA: -1, SOZ: NaN } })).toEqual({})
  expect(scoreText({ score: 327.5 })).toBe('327,5')
})
