import { describe, expect, it } from 'vitest';
import {
  formatSalaryExpectationInput,
  getSalaryExpectationError,
  normalizeSalaryExpectationForApi,
  SALARY_INVALID_MESSAGE,
  SALARY_REQUIRED_MESSAGE,
} from './salaryExpectation';

describe('salary expectation helpers', () => {
  it('formats typed digits as Brazilian currency', () => {
    expect(formatSalaryExpectationInput('250000')).toBe('R$ 2.500,00');
    expect(formatSalaryExpectationInput('300000')).toBe('R$ 3.000,00');
    expect(formatSalaryExpectationInput('1050050')).toBe('R$ 10.500,50');
  });

  it('requires a non-blank salary expectation', () => {
    expect(getSalaryExpectationError('')).toBe(SALARY_REQUIRED_MESSAGE);
    expect(getSalaryExpectationError('   ')).toBe(SALARY_REQUIRED_MESSAGE);
  });

  it('rejects zero and invalid values', () => {
    expect(getSalaryExpectationError('R$ 0,00')).toBe(SALARY_INVALID_MESSAGE);
    expect(getSalaryExpectationError('abc')).toBe(SALARY_INVALID_MESSAGE);
  });

  it('normalizes the masked value to the API decimal contract', () => {
    expect(normalizeSalaryExpectationForApi('R$ 2.500,00')).toBe('2500.00');
    expect(normalizeSalaryExpectationForApi('R$ 10.500,50')).toBe('10500.50');
  });
});
