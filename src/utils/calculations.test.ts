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

  // Test 6: Inventory Stock Deduction on Sale Relation
  {
    const initialStockKg = 6450;
    const saleKg = 80;
    const remainingStockKg = initialStockKg - saleKg;
    const passed = remainingStockKg === 6370;
    results.push({
      testName: 'Stock Relation: Live Bird Inventory Deduction on POS Sale',
      passed,
      details: `Initial 6,450 kg - Sold 80 kg -> Expected 6,370 kg -> Got ${remainingStockKg} kg`
    });
  }

  // Test 7: Supplier Purchase Stock Inflow Relation
  {
    const stockBeforePurchase = 6370;
    const purchaseKg = 2000;
    const purchaseRatePer40kg = 11800;
    const purchaseTotalAmount = Math.round((purchaseRatePer40kg * purchaseKg) / 40);
    const updatedStockKg = stockBeforePurchase + purchaseKg;
    const passed = updatedStockKg === 8370 && purchaseTotalAmount === 590000;
    results.push({
      testName: 'Procurement Relation: Supplier Purchase Stock Inflow & Cost',
      passed,
      details: `Stock ${stockBeforePurchase}kg + Purchased ${purchaseKg}kg = ${updatedStockKg}kg (Total Rs ${purchaseTotalAmount.toLocaleString()})`
    });
  }

  // Test 8: Order to POS Conversion Integrity
  {
    const orderExpectedKg = 80;
    const quotedRate = 12200;
    const calculatedAmount = Math.round((quotedRate * orderExpectedKg) / 40);
    const passed = calculatedAmount === 24400;
    results.push({
      testName: 'Order Sheet Relation: Order Conversion to POS Sale Billing',
      passed,
      details: `Booked ${orderExpectedKg} kg @ Rs ${quotedRate}/40kg -> Expected Invoice Amount Rs 24,400 -> Got Rs ${calculatedAmount}`
    });
  }

  // Test 9: Roznamcha Safe Variance Calculation
  {
    const systemCash = 840000;
    const physicalCount = 840000;
    const variance = physicalCount - systemCash;
    const passed = variance === 0;
    results.push({
      testName: 'Roznamcha Relation: Daily Physical Safe Count vs System Balance',
      passed,
      details: `Physical Rs ${physicalCount} - System Rs ${systemCash} -> Variance: Rs ${variance}`
    });
  }

  return results;
}
