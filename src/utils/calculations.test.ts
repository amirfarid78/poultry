import { calculateInvoice, normalizePakistanPhone } from './calculations';

/**
 * Verification test runner for core poultry sales formulas
 */
export function runAcceptanceTests() {
  const results: { testName: string; passed: boolean; details: string }[] = [];

  // Test 1: Opening balance 0 -> Sale: rate 12200, kg 80 -> Total 24400, Received 20000 -> Balance 4400
  {
    const step1 = calculateInvoice({
      mandiRate: 12000,
      saleRate: 12200,
      weightKg: 80,
      previousBalance: 0,
      receivedCash: 20000,
      receivedAC: 0
    });

    const passed = step1.totalAmount === 24400 && step1.newBalance === 4400;
    results.push({
      testName: 'Row 1 Acceptance Test: 80kg @ 12200, Recd 20000',
      passed,
      details: `Expected Total 24400 & Bal 4400 -> Got Total ${step1.totalAmount} & Bal ${step1.newBalance}`
    });
  }

  // Test 2: Next sale: rate 12000, kg 80 -> Total 24000, Received 20000 -> Balance 8400
  {
    const step2 = calculateInvoice({
      mandiRate: 12000,
      saleRate: 12000,
      weightKg: 80,
      previousBalance: 4400,
      receivedCash: 20000,
      receivedAC: 0
    });

    const passed = step2.totalAmount === 24000 && step2.newBalance === 8400;
    results.push({
      testName: 'Row 2 Acceptance Test: 80kg @ 12000, Recd 20000 with prev Bal 4400',
      passed,
      details: `Expected Total 24000 & Bal 8400 -> Got Total ${step2.totalAmount} & Bal ${step2.newBalance}`
    });
  }

  // Test 3: Payment only 20000 -> Balance -11600 (Advance)
  {
    const step3 = calculateInvoice({
      mandiRate: 0,
      saleRate: 0,
      weightKg: 0,
      previousBalance: 8400,
      receivedCash: 20000,
      receivedAC: 0
    });

    const passed = step3.totalAmount === 0 && step3.newBalance === -11600 && step3.isAdvance;
    results.push({
      testName: 'Row 3 Acceptance Test: Payment-only 20000 -> Advance -11600',
      passed,
      details: `Expected Bal -11600 (Advance) -> Got Bal ${step3.newBalance} (isAdvance=${step3.isAdvance})`
    });
  }

  // Test 4: Handwritten example: A=4000; sale rate 13200 kg 60 -> Total 19800; C=9000; B=8000 -> Balance 6800
  {
    const step4 = calculateInvoice({
      mandiRate: 13000,
      saleRate: 13200,
      weightKg: 60,
      previousBalance: 4000,
      receivedCash: 9000, // C = 9000 Wasool
      receivedAC: 8000   // B = 8000 AC Payment
    });

    const passed = step4.totalAmount === 19800 && step4.newBalance === 6800;
    results.push({
      testName: 'Handwritten Sheet Formula: 60kg @ 13200, C=9000, B=8000, Prev=4000',
      passed,
      details: `Expected Total 19800 & Bal 6800 -> Got Total ${step4.totalAmount} & Bal ${step4.newBalance}`
    });
  }

  // Test 5: Pakistani Phone Normalization
  {
    const p1 = normalizePakistanPhone('03001234567');
    const p2 = normalizePakistanPhone('+92 321 9876543');
    const p3 = normalizePakistanPhone('00923335551234');
    const passed = p1 === '923001234567' && p2 === '923219876543' && p3 === '923335551234';
    results.push({
      testName: 'Pakistani Phone Number Normalization',
      passed,
      details: `p1=${p1}, p2=${p2}, p3=${p3}`
    });
  }

  return results;
}
